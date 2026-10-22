import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { AuthContext } from "./context/auth-context"
import { OutfitContext, OutfitFuncContext } from "./context/outfit-context"
import ItemCard from "./itemCard"
import RadialButton from "./generic/radialButton"
import { defaultOnClick } from "./categoryShared"
import NothingLoaded from "./nothingLoaded"
import { AlertContext } from "./context/alert-context"
import { Authentication, type Search_Payload, type ItemDetails_Result, type Favorites_Result, API, CategoryDictionary, type Inventory_Result, Outfit, ItemInfo, AssetTypes, BundleTypes, CatalogBundleTypes, SortInfo } from "roavatar-renderer"
import { setSetting } from "./generic/settings"

type ItemList = {itemType: "Asset" | "Bundle", id: number}[]
async function getItemDetailsIfNeeded(auth: Authentication, items: ItemList, searchData: Search_Payload): Promise<undefined | Response | ItemDetails_Result> {
    const isNeeded = searchData.includeNotForSale === false ||
    searchData.salesTypeFilter === 2 ||
    searchData.creatorName && searchData.creatorName.length > 0 ||
    searchData.minPrice !== undefined ||
    searchData.maxPrice !== undefined

    if (isNeeded) {
        return await API.Catalog.GetItemDetails(auth, items)
    }

    return undefined
}

function itemPassesFilter(item: ItemDetails_Result["data"][0], searchData: Search_Payload): boolean {
    return !!(
        (!item.isOffSale || searchData.includeNotForSale) &&
        ((item.itemRestrictions.includes("Limited") || item.itemRestrictions.includes("LimitedUnique")) || searchData.salesTypeFilter !== 2) &&
        (!searchData.creatorName || searchData.creatorName.length < 0 || item.creatorName.toLowerCase() === searchData.creatorName.toLowerCase()) &&
        (searchData.minPrice == undefined || item.lowestPrice && item.lowestPrice >= searchData.minPrice) &&
        (searchData.maxPrice == undefined || item.lowestPrice && item.lowestPrice <= searchData.maxPrice)
    )
}

function favoriteItemPassesFilter(item: Favorites_Result["data"][0], searchData: Search_Payload, price: number | undefined, offsale: boolean): boolean {
    const isLimited = item.itemRestrictions.includes("Limited") || item.itemRestrictions.includes("LimitedUnique") || item.itemRestrictions.includes("Collectible")

    return !!(
        (!offsale || searchData.includeNotForSale) &&
        (isLimited || searchData.salesTypeFilter !== 2) &&
        (!searchData.creatorName || item.creatorName.toLowerCase() === searchData.creatorName.toLowerCase()) &&
        (searchData.minPrice === undefined || !offsale && price != null && price >= searchData.minPrice) &&
        (searchData.maxPrice === undefined || !offsale && price != null && price <= searchData.maxPrice)
    )
}

async function getFavoriteLooks(userId: number, cursor: string, signal: AbortSignal): Promise<Favorites_Result | Response> {
    const page = await API.Looks.GetFavoriteLooks(userId, cursor, 20, signal)
    if (page instanceof Response) {
        return page
    }

    const data: Favorites_Result["data"] = []
    // Look favorites contain IDs only. Load a grid page of details in small batches.
    for (let i = 0; i < page.lookIds.length; i += 4) {
        signal.throwIfAborted()
        const details = await Promise.all(page.lookIds.slice(i, i + 4).map((id) => {
            return API.Looks.GetLook(id)
        }))
        signal.throwIfAborted()
        for (const result of details) {
            if (result instanceof Response) {
                if (result.status === 404) {
                    continue
                }
                return result
            }

            const look = result.look
            const itemRestrictions: string[] = []
            const bundledItems: Favorites_Result["data"][0]["bundledItems"] = []
            let isOffSale = false

            for (const item of look.items) {
                if (item.itemRestrictions) itemRestrictions.push(...item.itemRestrictions)
                if (!item.isPurchasable) {
                    isOffSale = true
                }

                if (item.itemType === "Asset") {
                    bundledItems.push({id: item.id, type: "Asset"})
                } else {
                    for (const asset of item.assetsInBundle) {
                        if (asset.isIncluded) {
                            bundledItems.push({id: asset.id, type: "Asset"})
                        }
                    }
                }
            }

            data.push({
                id: look.lookId,
                itemType: "Look",
                name: look.name,
                creatorName: look.curator.name,
                creatorTargetId: look.curator.id,
                itemRestrictions: itemRestrictions,
                price: look.totalValue,
                lowestResalePrice: 0,
                hasResellers: false,
                isOffSale: isOffSale,
                bundledItems: bundledItems,
            })
        }
    }
    return {data, nextPageCursor: page.nextPageCursor, previousPageCursor: page.previousPageCursor}
}

function useItems(auth: Authentication | undefined, categorySource: string, category: string, subCategory: string, searchData: Search_Payload) {
    const lastCategorySource = useRef("")
    const lastCategory = useRef("")
    const lastSubCategory = useRef("")
    const lastLoadId = useRef(0)
    const lastSearchData = useRef<Search_Payload | undefined>(undefined)
    const lastDetailsRateLimit = useRef(0)
    const favoriteTypeIndex = useRef(0)
    const favoritesRequest = useRef<AbortController | undefined>(undefined)
    const renderLoadId = lastLoadId.current

    const [nextPageToken, setNextPageToken] = useState<string | null | undefined>("")
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [items, setItems] = useState<AvatarInventoryItem[]>([])
    const [failedToLoad, setFailedToLoad] = useState<boolean>(false)

    const itemsInIds = items.map((a) => {return a.itemCategory.itemType.toString() + "_" + a.itemId.toString()})

    const refresh = () => {
        setItems([])
        setNextPageToken("")
        setIsLoading(false)
        setFailedToLoad(false)
        favoritesRequest.current?.abort()
        favoriteTypeIndex.current = 0
        lastLoadId.current++
    }

    useEffect(() => {
        return () => {
            lastLoadId.current = lastLoadId.current + 1
            favoritesRequest.current?.abort()
        }
    }, [])

    //refresh if searchData has changed
    useEffect(() => {
        if (searchData.taxonomy !== lastSearchData?.current?.taxonomy ||
            searchData.salesTypeFilter !== lastSearchData?.current?.salesTypeFilter ||
            searchData.categoryFilter !== lastSearchData?.current?.categoryFilter ||
            searchData.sortType !== lastSearchData?.current?.sortType ||
            searchData.keyword !== lastSearchData?.current?.keyword ||
            searchData.topics?.length !== lastSearchData?.current?.topics?.length || //is this okay?
            searchData.creatorName !== lastSearchData?.current?.creatorName ||
            searchData.minPrice !== lastSearchData?.current?.minPrice ||
            searchData.maxPrice !== lastSearchData?.current?.maxPrice ||
            searchData.includeNotForSale !== lastSearchData?.current?.includeNotForSale ||
            searchData.limit !== lastSearchData?.current?.limit
        ) {
            lastSearchData.current = searchData
            refresh()
        }
    }, [searchData])

    useEffect(() => {
        if (categorySource !== lastCategorySource.current || category !== lastCategory.current || subCategory !== lastSubCategory.current) {
            lastCategorySource.current = categorySource
            lastCategory.current = category
            lastSubCategory.current = subCategory
            refresh()
        }
    }, [categorySource, category, subCategory])

    const sortInfo = CategoryDictionary[categorySource][category][subCategory]
    if (!(sortInfo instanceof SortInfo)) {
        throw new Error("ItemCategory does not support special sort types")
    }

    const sortOption = sortInfo.sortOption
    const itemInfos = sortInfo.itemCategories

    const loadMore = (force: boolean = false) => {
        if (!auth || (isLoading && !force)) return
        // A refresh effect invalidates the previous render's cursor before the
        // new state is rendered. Do not start a favorites request with that cursor.
        if (categorySource === "Favorites" && (renderLoadId !== lastLoadId.current || failedToLoad)) return

        lastLoadId.current++
        const loadId = lastLoadId.current

        if (nextPageToken !== null && nextPageToken !== undefined) {
            setIsLoading(true)
            if (categorySource === "Favorites") {
                const typeIndex = favoriteTypeIndex.current
                const itemSort = itemInfos[typeIndex]
                if (!itemSort) {
                    setNextPageToken(null)
                    setIsLoading(false)
                    return
                }

                let itemType: "Asset" | "Bundle" | "Look" = "Asset"
                if (itemSort.itemType === "Bundle") {
                    itemType = "Bundle"
                } else if (itemSort.itemType === "Look") {
                    itemType = "Look"
                }

                const controller = new AbortController()
                favoritesRequest.current = controller
                auth.getUserInfo().then(userInfo => {
                    if (loadId !== lastLoadId.current) return
                    if (!userInfo) {
                        setFailedToLoad(true)
                        return
                    }

                    let request: Promise<Favorites_Result | Response>
                    if (itemType === "Look") {
                        request = getFavoriteLooks(userInfo.id, nextPageToken, controller.signal)
                    } else {
                        request = API.Catalog.GetFavorites(userInfo.id, itemSort.subType, nextPageToken, 100, controller.signal, itemType)
                    }

                    return request.then(body => {
                        if (loadId !== lastLoadId.current) return
                        if (body instanceof Response) {
                            console.warn("Failed to get favorites", body)
                            setFailedToLoad(true)
                            return
                        }

                        const newItems: AvatarInventoryItem[] = []
                        const newItemIds = [...itemsInIds]
                        for (const item of body.data) {
                            // Only accept items of the avatar type requested by this category.
                            let subType = item.assetType
                            if (item.itemType === "Bundle") {
                                subType = item.bundleType
                            } else if (item.itemType === "Look") {
                                subType = 0
                            }
                            if (item.itemType !== itemType || subType !== itemSort.subType) continue

                            let price = item.price
                            if (item.hasResellers) {
                                if (item.lowestResalePrice > 0) {
                                    price = item.lowestResalePrice
                                } else {
                                    price = item.lowestPrice ?? item.price
                                }
                            }

                            const offsale = !item.hasResellers && (item.isOffSale === true || item.priceStatus === "Off Sale" || price == null)
                            let limitedType: "Limited" | "LimitedUnique" | undefined = undefined
                            if (item.itemRestrictions.includes("Limited")) {
                                limitedType = "Limited"
                            } else if (item.itemRestrictions.includes("LimitedUnique") || item.itemRestrictions.includes("Collectible")) {
                                limitedType = "LimitedUnique"
                            }

                            const passedSearch = !searchData.keyword || item.name.toLowerCase().includes(searchData.keyword.toLowerCase())
                            const passedFilter = favoriteItemPassesFilter(item, searchData, price, offsale)

                            let itemCategoryType = 1
                            if (item.itemType === "Bundle") {
                                itemCategoryType = 0
                            } else if (item.itemType === "Look") {
                                itemCategoryType = 2
                            }

                            const selfItemId = itemCategoryType.toString() + "_" + item.id.toString()
                            const alreadyAdded = newItemIds.includes(selfItemId)
                            if (passedSearch && passedFilter && !alreadyAdded) {
                                let outfitDetail = undefined
                                if (item.itemType !== "Asset") {
                                    outfitDetail = {assets: item.bundledItems.filter((asset) => {return asset.type === "Asset"})}
                                }
                                newItems.push({
                                    itemCategory: {itemType: itemCategoryType, itemSubType: subType},
                                    itemId: item.id,
                                    itemName: item.name,
                                    supportsHeadShapes: item.supportsHeadShapes,
                                    price: offsale ? undefined : price,
                                    offsale: offsale,
                                    limitedType: limitedType,
                                    creatorId: item.creatorTargetId,
                                    outfitDetail: outfitDetail,
                                })
                                newItemIds.push(selfItemId)
                            }
                        }

                        setItems(prev => [...prev, ...newItems])

                        if (body.nextPageCursor) {
                            setNextPageToken(body.nextPageCursor)
                        } else {
                            favoriteTypeIndex.current = typeIndex + 1
                            setNextPageToken(typeIndex + 1 < itemInfos.length ? "" : null)
                        }
                    })
                }).catch(error => {
                    if (loadId !== lastLoadId.current) return
                    console.warn("Failed to get favorites", error)
                    setFailedToLoad(true)
                }).finally(() => {
                    if (loadId !== lastLoadId.current) return
                    setIsLoading(false)
                })
            } else if (sortOption !== "inventory") {
                API.Avatar.GetAvatarInventory(sortOption, nextPageToken, itemInfos).then(body => {
                    if (loadId !== lastLoadId.current) return
                    if (!(body instanceof Response)) {
                        if (Date.now() / 1000 - lastDetailsRateLimit.current < 2) {
                            //setIsLoading(false)
                            setTimeout(loadMore, 2000, true)
                            return
                        }
                        //console.log(body)
                        
                        getItemDetailsIfNeeded(auth, body.avatarInventoryItems.map((a) => {
                            return {itemType: a.itemCategory.itemType === 1 ? "Asset" : "Bundle", id: a.itemId}
                        }), searchData).then((itemDetails) => {
                            //prevent too much spam
                            if (loadId !== lastLoadId.current) return
                            if (itemDetails instanceof Response) {
                                console.warn("Failed to get itemDetails", itemDetails)
                                lastDetailsRateLimit.current = Date.now() / 1000
                                setIsLoading(false)
                                return
                            }

                            //update page token
                            const pageToken = body.nextPageToken
                            if (pageToken && pageToken.length > 0) {
                                setNextPageToken(pageToken)
                            } else {
                                setNextPageToken(null)
                            }

                            const newItems: AvatarInventoryItem[] = []
                            for (const item of body.avatarInventoryItems) {
                                const itemType = item.itemCategory.itemType === 1 ? "Asset" : "Bundle"

                                if (itemDetails && itemType == "Bundle") continue

                                //check if item passes filter
                                let passedFilter = true
                                if (itemDetails) {
                                    const itemDetail = itemDetails.data.find((a) => {return a.id === item.itemId && a.itemType === itemType})

                                    if (itemDetail) {
                                        if (itemDetail.itemRestrictions.includes("Limited")) {
                                            (item as AvatarInventoryItem).limitedType = "Limited";
                                        }
                                        if (itemDetail.itemRestrictions.includes("LimitedUnique")) {
                                            (item as AvatarInventoryItem).limitedType = "LimitedUnique";
                                        }
                                        passedFilter = itemPassesFilter(itemDetail, searchData)
                                    }
                                }

                                const passedSearch = !searchData.keyword || item.itemName.toLowerCase().includes(searchData.keyword.toLowerCase())

                                //check that item hasnt already been added
                                const selfItemId = item.itemCategory.itemType.toString() + "_" + item.itemId.toString()
                                const alreadyAdded = itemsInIds.includes(selfItemId)

                                if (passedSearch && passedFilter && !alreadyAdded) {
                                    newItems.push(item)
                                }
                            }
                            setItems(prev => [...prev, ...newItems])
                        }).finally(() => {
                            setIsLoading(false)
                        })
                    } else {
                        console.warn("Failed to get avatar inventory", body)
                        setIsLoading(false)
                    }
                })
            } else {
                auth.getUserInfo().then(userInfo => {
                    if (!userInfo) {
                        return
                    }

                    API.Inventory.GetInventory(userInfo.id, itemInfos[0].subType, nextPageToken).then(response => {
                        if (loadId !== lastLoadId.current) return
                        if (response.status === 200) {
                            response.json().then((body: Inventory_Result) => {
                                if (loadId !== lastLoadId.current) return

                                const pageToken = body.nextPageCursor
                                if (pageToken && pageToken.length > 0) {
                                    setNextPageToken(pageToken)
                                } else {
                                    setNextPageToken(null)
                                }

                                const newItems: AvatarInventoryItem[] = []
                                for (const asset of body.data) {
                                    if (!searchData.keyword || asset.assetName.toLowerCase().includes(searchData.keyword.toLowerCase())) {
                                        newItems.push({
                                            itemCategory: {itemType: 1, itemSubType: itemInfos[0].subType},
                                            itemId: asset.assetId,
                                            itemName: asset.assetName,
                                        })
                                    }
                                }
                                setItems(prev => [...prev, ...newItems])
                            }).finally(() => {
                                if (loadId !== lastLoadId.current) return
                                setIsLoading(false)
                            })
                        } else {
                            setIsLoading(false)
                        }
                    }).finally(() => {
                        if (loadId !== lastLoadId.current) return
                        setIsLoading(false)
                    })
                }).finally(() => {
                    if (loadId !== lastLoadId.current) return
                    setIsLoading(false)
                })
            }
        }
    }

    const hasLoadedAll = nextPageToken === null || nextPageToken === undefined

    return {items, isLoading, loadMore, hasLoadedAll, refresh, failedToLoad }
}

type AvatarInventoryItem = {
    itemName: string,
    itemId: number | string,
    itemCategory: {itemType: number, itemSubType: number},
    outfitDetail?: {assets: {id: number}[]},
    limitedType?: "Limited" | "LimitedUnique",
    expirationTime?: string,
    acquisitionTime?: string,
    price?: number,
    offsale?: boolean,
    supportsHeadShapes?: boolean,
    creatorId?: number,
}

export default function ItemCategory({children, categorySource = "Inventory", searchData, categoryType, subCategoryType, animName, setAnimName, onClickItem, wornItems = [], showNames = true, style = {}}: React.PropsWithChildren & {categorySource?: string, searchData: Search_Payload, categoryType: string, subCategoryType: string, setOutfit: (a: Outfit) => void, animName: string, setAnimName: (a: string) => void, onClickItem?: (a: Authentication, b: ItemInfo) => void, wornItems?: number[], showNames?: boolean, style?: React.CSSProperties}): React.JSX.Element {
    const auth = useContext(AuthContext)
    const outfit = useContext(OutfitContext)
    const alert = useContext(AlertContext)
    const outfitFunc = useContext(OutfitFuncContext)

    const outfitNameInputRef: React.RefObject<HTMLInputElement | null> = useRef(null)
    const createOutfitDialogRef: React.RefObject<HTMLDialogElement | null> = useRef(null)
    const scrollDivRef: React.RefObject<HTMLDivElement | null> = useRef(null)

    const [outfitDialogOpen, setOutfitDialogOpen] = useState(false)

    const {items, isLoading, loadMore, hasLoadedAll, refresh, failedToLoad } = useItems(auth, categorySource, categoryType, subCategoryType, searchData)

    //manage open state of create outfit dialog
    useEffect(() => {
        if (outfitDialogOpen) {
            createOutfitDialogRef.current?.showModal()
        } else {
            createOutfitDialogRef.current?.close()
        }
    }, [outfitDialogOpen])

    //scroll to start when searchData changes
    useEffect(() => {
        if (scrollDivRef.current) {
            scrollDivRef.current.scrollTo(0,0)
        }
    }, [categorySource, categoryType, subCategoryType, searchData])

    //check if it should load more on scroll
    const onScroll = useCallback(() => {
        if (scrollDivRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollDivRef.current;
            if (scrollTop + clientHeight >= scrollHeight - 200) {
                loadMore()
            }
        }
    }, [loadMore])

    //load more if nothing has been loaded yet
    useEffect(() => {
        if (!hasLoadedAll && items.length <= 0) {
            loadMore()
        } else {
            //in case the amount of items isnt enough to add a scrollbar but there is still another page
            onScroll()
        }
    }, [hasLoadedAll, items.length, loadMore, onScroll])

    const isOutfits = categorySource === "Inventory" && categoryType === "Avatars" && subCategoryType === "Creations"

    //create item infos based on response
    const itemInfos: ItemInfo[] = []
    for (const item of items) {
        let itemType: "Asset" | "Outfit" | "Bundle" | "Look" = "Outfit"
        if (item.itemCategory.itemType === 1) {
            itemType = "Asset"
        } else if (categorySource === "Favorites") {
            if (item.itemCategory.itemType === 2) {
                itemType = "Look"
            } else {
                itemType = "Bundle"
            }
        }
        let itemSubType: string = "undefined"
        if (itemType === "Asset") {
            itemSubType = AssetTypes[item.itemCategory.itemSubType]
        } else if (itemType === "Outfit") {
            itemSubType = BundleTypes[item.itemCategory.itemSubType]
        } else if (itemType === "Bundle") {
            itemSubType = CatalogBundleTypes[item.itemCategory.itemSubType]
        } else if (itemType === "Look") {
            itemSubType = "Look"
        }

        const itemInfo = new ItemInfo(itemType, itemSubType, item.itemId, item.itemName, item.supportsHeadShapes)
        itemInfo.limitedType = item.limitedType
        itemInfo.price = item.price
        itemInfo.offsale = item.offsale
        itemInfo.creatorId = item.creatorId
        if (item.outfitDetail?.assets) {
            for (const asset of item.outfitDetail.assets) {
                itemInfo.bundledAssets.push(asset.id)
            }
        }
        if (item.acquisitionTime) {
            itemInfo.acquisitionTime = new Date(item.acquisitionTime)
        }
        if (item.expirationTime) {
            itemInfo.expirationTime = new Date(item.expirationTime)
        }
        if (isOutfits) {
            API.Users.GetUserInfo().then((userInfo) => {
                itemInfo.creatorId = userInfo?.id
            })
        }

        itemInfos.push(itemInfo)
    }

    //determine on click function for itemcards
    const onClickFunc = onClickItem

    //create item cards
    let itemComponents = null

    if (failedToLoad) {
        itemComponents = <NothingLoaded loadedAll={true} itemCount={0} forceText="Failed to load"/>
    } else if (auth && itemInfos.length > 0 || hasLoadedAll && auth) {
        let i = 0;
        itemComponents = <>
        {/*CREATE OUTFIT DIALOG */
        isOutfits ?
        <>
            <dialog style={outfitDialogOpen ? {opacity: 1} : {display: "none", opacity: 0}} ref={createOutfitDialogRef} onCancel={() => {setOutfitDialogOpen(false)}}>
                <span className="dialog-title roboto-700">Create New Character</span>
                <div className="dialog-line"></div>
                <span className="dialog-text dialog-text-margin roboto-400">A saved character will be created from your current appearance</span>
                <input ref={outfitNameInputRef} className="dialog-text-input roboto-400" placeholder="Name" maxLength={1000}></input>
                <div className="dialog-line"></div>
                <div className="dialog-actions">
                    <RadialButton className="dialog-cancel roboto-600" onClick={() => {
                        setOutfitDialogOpen(false)
                    }}>Cancel</RadialButton>
                    <RadialButton className="dialog-confirm roboto-600" onClick={() => {
                        setOutfitDialogOpen(false)

                        const nameValue = outfitNameInputRef.current?.value || ""

                        const toSaveOutfitModel = outfitFunc.outfitModel.clone()
                        if (nameValue.length > 0) {
                            toSaveOutfitModel.outfit.name = nameValue
                        } else {
                            toSaveOutfitModel.outfit.name = "Untitled Avatar"
                        }

                        API.Avatar.CreateOutfitModel(auth, toSaveOutfitModel).then((result) => {
                            if (result.status === 200) {
                                setSetting("recovery-outfit", null)
                                refresh()
                            } else {
                                if (alert) {
                                    alert("Failed to save outfit, if you're missing items try saving to Local instead", 4000, false)
                                }
                            }
                        })
                    }}>Create</RadialButton>
                </div>
            </dialog>
            <ItemCard key={i++} auth={auth} forceImage="../assets/newnewoutfit.png" imageAffectedByTheme={true} itemInfo={new ItemInfo("None", "", -1, "Create")} buttonClassName="item-template-button" onClick={() => {
                setOutfitDialogOpen(true)
            }}/>
        </> : null}
        {
            itemInfos.map((item) => (
                <ItemCard key={i++} auth={auth} itemInfo={item} refresh={refresh} showViewButton={categorySource === "Favorites"} canEditOutfit={isOutfits} isWorn={item.itemType === "Asset" ? outfit.containsAsset(Number(item.id)) || wornItems.includes(Number(item.id)) : false} includeName={showNames} onClick={(item) => {
                    if (onClickFunc) {
                        onClickFunc(auth, item)
                    } else {
                        defaultOnClick(item, outfitFunc.outfitModel, outfitFunc.setOutfitModel, setAnimName, animName, auth)
                    }
                }}/>
            ))
        }
        <NothingLoaded loadedAll={hasLoadedAll} itemCount={itemInfos.length} keyword={searchData.keyword} searchData={searchData}/>
        </>
    } else if (!hasLoadedAll) { //fake items while loading
        itemComponents = <>{
            new Array(20).fill(0).map(() => (
                <ItemCard/>
            ))
        }</>
    }
    /*const fakeLoaderImageStyle = {
        alignItems: "center",
        justifyContent: "center",
        height: "150px",
        cursor: "initial",
    }*/

    return (
    <div className="container" style={style}>
        <div ref={scrollDivRef} onScroll={onScroll} className="item-container dark-scrollbar">
            {children}
            {itemComponents}
            { isLoading ? (new Array(20).fill(0).map(() => (
                <ItemCard/>
            ))) : null}
            {/*isLoading ? (<div className="item" style={fakeLoaderImageStyle}><span className="loader"></span></div>) : null*/}
        </div>
        
    </div>
    )
}