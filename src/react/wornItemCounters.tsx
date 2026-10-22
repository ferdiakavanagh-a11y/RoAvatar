import { useContext, useEffect, useState } from "react"
import { AccessoryAssetTypes, LayeredAssetTypes, MakeupAssetTypes, MaxOneOfAssetTypes } from "roavatar-renderer"
import { OutfitContext } from "./context/outfit-context"
import { getSetting, OnSettingChange } from "./generic/settings"
import Icon from "./generic/icon"
import { Tooltip } from "react-tooltip"

function getStyle(count: number, maxCount: number) {
    const errorStyle = {backgroundColor: "rgb(212, 35, 59)"}
    const warningStyle = {backgroundColor: "rgb(230, 162, 59)"}

    if (count > maxCount) return errorStyle
    if (count > maxCount - 1) return warningStyle
    return
}

export default function WornItemCounters(): React.JSX.Element {
    const outfit = useContext(OutfitContext)
    const [showCounters, setShowCounters] = useState<boolean>(true)

    useEffect(() => {
        getSetting("s-show-accessory-counter", false).then((value) => {
            setShowCounters(value as boolean)
        })

        const connection = OnSettingChange.Connect((storage, value) => {
            if (storage as string === "s-show-accessory-counter") {
                setShowCounters(value as boolean)
            }
        })

        return () => {
            connection.Disconnect()
        }
    }, [])

    let accessoryCount = 0
    let layeredCount = 0
    let makeupCount = 0

    for (const asset of outfit.assets) {
        const assetType = asset.assetType.name
        if (AccessoryAssetTypes.includes(assetType)) {
            accessoryCount += 1
        }
        if (LayeredAssetTypes.includes(assetType) && !MakeupAssetTypes.includes(assetType) && !MaxOneOfAssetTypes.includes(assetType)) {
            layeredCount += 1
        }
        if (MakeupAssetTypes.includes(assetType)) {
            makeupCount += 1
        }
    }

    if (!showCounters) {
        return <></>
    }

    return <>
    <Tooltip id="worn-item-tooltip"/>
    <div className="worn-item-counters roboto-600">
        <span className="worn-item-counter" data-tooltip-id="worn-item-tooltip" data-tooltip-content="Accessories" style={getStyle(accessoryCount, 10)}>
            <Icon>eyeglasses_2</Icon>
            <span>{accessoryCount}/10</span>
        </span>
        <span className="worn-item-counter" data-tooltip-id="worn-item-tooltip" data-tooltip-content="Layered items" style={getStyle(layeredCount, 10)}>
            <Icon>apparel</Icon>
            <span>{layeredCount}/10</span>
        </span>
        <span className="worn-item-counter" data-tooltip-id="worn-item-tooltip" data-tooltip-content="Makeup" style={getStyle(makeupCount, 6)}>
            <Icon>health_and_beauty</Icon>
            <span>{makeupCount}/6</span>
        </span>
    </div>
    </>
}