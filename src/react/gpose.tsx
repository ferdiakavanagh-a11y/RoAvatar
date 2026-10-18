import * as THREE from "three"
import { useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from "react"
import { AnimLock, OutfitFuncContext } from "./context/outfit-context"
import SelectInput from "./generic/selectInput"
import Icon from "./generic/icon"
import { Tooltip } from "react-tooltip"
import RadialButton from "./generic/radialButton"
import { getCameraData, setCameraData } from "./generic/cameraData"
import SliderInput from "./generic/sliderInput"
import { BackgroundRenderer, FLAGS, mapNum, RBXRenderer, type AnimatorWrapper, type Instance } from "roavatar-renderer"
import ItemCategory from "./itemCategory"
import { capitalizeFirstLetter, R15_Animations, R6_Animations } from "./generic/animation"
import ToggleButton from "./generic/toggleButton"
import { AlertContext } from "./context/alert-context"

type GPoseCategoryType = "Pose" | "Camera" | "Lighting" | "Scene" | "Export"
const GPoseCategoryTypes: GPoseCategoryType[] = ["Pose", "Camera", "Lighting", "Scene", "Export"]

function getAnimatorW(rig: Instance | undefined): AnimatorWrapper | undefined {
    if (!rig) return

    const humanoid = rig.FindFirstChildOfClass("Humanoid")
    if (!humanoid) return

    const animator = humanoid.FindFirstChildOfClass("Animator")
    if (!animator) return

    const animatorW = animator.w as AnimatorWrapper

    return animatorW
}

function getAnimationTimeLength(rig: Instance | undefined): [number, number] {
    const animatorW = getAnimatorW(rig)
    if (!animatorW) return [0,0]

    const currentAnimationTrack = animatorW.getCurrentAnimationTrack()
    if (!currentAnimationTrack) return [0,0]

    return [currentAnimationTrack.timePosition, currentAnimationTrack.length]
}

type PoseType = "Emote" | "Avatar Animation" | "Animation Asset"
const PoseTypes = ["Emote", "Avatar Animation", "Animation Asset"]

function PoseCategory({animLock, setAnimLock}: {animLock: AnimLock, setAnimLock: (a: AnimLock) => void}): React.JSX.Element {
    const outfitFunc = useContext(OutfitFuncContext)

    const isPlay = !animLock.locked

    const poseType: PoseType = outfitFunc.animName.startsWith("emote.") ? "Emote" : outfitFunc.animName.startsWith("id.") ? "Animation Asset" : "Avatar Animation"
    
    const setPoseType =  useCallback((newPoseType: PoseType) => {
        switch (newPoseType) {
            case "Emote":
                outfitFunc.setAnimName("emote.3576686446", true) //Hello
                outfitFunc.setAnimLock(new AnimLock())
                setTempAnimationId("3576686446")
                break
            case "Animation Asset":
                outfitFunc.setAnimName("id.17684049321", true)
                outfitFunc.setAnimLock(new AnimLock())
                setTempAnimationId("17684049321")
                break
            case "Avatar Animation":
                outfitFunc.setAnimName("idle", true)
                outfitFunc.setAnimLock(new AnimLock())
                break
        }
    }, [outfitFunc])

    const animationIdInputRef = useRef<HTMLInputElement | null>(null)

    let animationId = String(Number(outfitFunc.animName.split(".")[1] || 0))
    if (animationId === "0") animationId = ""

    const [tempAnimationId, setTempAnimationId] = useState<string>(animationId)

    return <>
    <div className="adjust-line"></div>
    {/*Animation selection */}
    <div className="animation-selection">
        <SelectInput value={poseType} setValue={setPoseType as (a: string) => void} alternatives={PoseTypes}/>

        {poseType === "Emote" || poseType === "Animation Asset" ? 
                <form onSubmit={(e) => {
                    let finalTempAnimationId = tempAnimationId

                    //check if initial is valid
                    const isValid = tempAnimationId.match(/^[0-9]*$/g)
                    if (!isValid) { //check for id in url if not valid
                        const ids = tempAnimationId.match(/^\d+|\d+\b|\d+(?=\w)/g)
                        let id = null
                        if (ids) {
                            id = ids[0]
                        }

                        if (id) {
                            finalTempAnimationId = id
                        }
                    }

                    if (!finalTempAnimationId.match(/^[0-9]*$/g)) return

                    e.preventDefault()
                    outfitFunc.setAnimName(poseType == "Emote" ? "emote." + finalTempAnimationId : "id." + finalTempAnimationId, true)
                    outfitFunc.setAnimLock(new AnimLock())
                }}
                    onChange={() => {
                        setTempAnimationId(animationIdInputRef.current?.value || "")
                    }}
                >

                    <input ref={animationIdInputRef} className="roboto-600" placeholder="Asset ID" value={tempAnimationId}></input>
                </form>
            
            : 
            <SelectInput 
                value={capitalizeFirstLetter(outfitFunc.animName)}
                setValue={
                    (a: string) => {
                        outfitFunc.setAnimName(a.toLowerCase(), true)
                        outfitFunc.setAnimLock(new AnimLock())
                    }
                }
                alternatives={outfitFunc.outfitModel.outfit.playerAvatarType === "R6" ? R6_Animations : R15_Animations}/>
        }
    </div>
    <ItemCategory
        searchData={{taxonomy:"", salesTypeFilter: 0}}
        categoryType={"Animations"}
        subCategoryType={"_Emotes"}
        setOutfit={outfitFunc.setOutfit}
        animName={outfitFunc.animName}
        setAnimName={(a: string) => {outfitFunc.setAnimName(a, true)}}
        wornItems={[]}
        onClickItem={(_auth, itemInfo) => {
            setPoseType("Emote")
            outfitFunc.setAnimName("emote." + String(itemInfo.id), true)
            setTempAnimationId(String(itemInfo.id))
        }}
        showNames={false}
    />
    
    <div className="adjust-line"></div>
    {/*Look at camera stuff*/}
    <div className="choice-button-container">
        <RadialButton className="roboto-600 choice-button" onClick={() => {
            const cameraData = getCameraData()
            cameraData.gposeFacePos = RBXRenderer.firstScene.camera.position.toArray()
            cameraData.gposeFaceWeight = 1
            setCameraData(cameraData)
        }}>Look at Camera</RadialButton>
        <RadialButton className="roboto-600 choice-button" onClick={() => {
            const cameraData = getCameraData()
            cameraData.gposeFaceWeight = 0
            setCameraData(cameraData)
        }}>Reset Look</RadialButton>
    </div>

    <div className="adjust-line"></div>
    {/*Animation time control */}
    <div className="animation-controller">
        <RadialButton className="left-top-button icon-button" data-tooltip-content={isPlay ? "Pause" : "Play"} data-tooltip-id="pose-play" onClick={() => {
                const newAnimLock = new AnimLock()
                if (isPlay) {
                    newAnimLock.locked = true
                    newAnimLock.lockType = "none"
                    newAnimLock.deltaTimeMult = 0
                }

                setAnimLock(newAnimLock)
            }}>
                <Icon>{isPlay ? "pause" : "play_arrow"}</Icon>
        </RadialButton>
        <SliderInput value={() => {
            const [animTime, animLength] = getAnimationTimeLength(outfitFunc.currentRig)
            return mapNum(animTime, 0, animLength, 0, 1)
        }} setValue={(v) => {
            const [, animLength] = getAnimationTimeLength(outfitFunc.currentRig)
            const newTime = mapNum(v, 0, 1, 0, animLength - 0.001)

            if (isPlay) {
                const newAnimLock = new AnimLock()
                newAnimLock.locked = true
                newAnimLock.lockType = "none"
                newAnimLock.deltaTimeMult = 0

                setAnimLock(newAnimLock)
            }
            
            getAnimatorW(outfitFunc.currentRig)?.getCurrentAnimationTrack()?.setTime(newTime)
        }} ></SliderInput>
        <Tooltip id="pose-play"/>
    </div>
    </>
}

function CustomizationSlider({name, min, max, normal, value, setValue, restrictWithinMaxRange: restrictWithinRange = true}: {
    name: string,
    min: number,
    max: number,
    normal: number,
    value: number,
    setValue: (a: number) => void,
    restrictWithinMaxRange?: boolean,
}): React.JSX.Element {
    const inputRef = useRef<HTMLInputElement | null>(null)

    const [proposedValue, setProposedValue] = useState<string | undefined>(undefined)

    const valueToShow = proposedValue !== undefined ? proposedValue : Math.round(value * 100) / 100

    //remove proposed value on unfocus
    useEffect(() => {
        const input = inputRef.current
        if (!input) return

        function focusoutEvent() {
            setProposedValue(undefined)
        }

        input.addEventListener("focusout", focusoutEvent)

        return () => {
            input.removeEventListener("focusout", focusoutEvent)
        }
    })

    return <div className="thumbnail-customization-slider">
        <div className="thumbnail-customization-top">
            <span className="thumbnail-customization-slider-name roboto-600">{name}</span>
            <input ref={inputRef} className="slider-value-input roboto-600" value={valueToShow} onChange={(e) => {
                const input = inputRef.current
                if (input) {
                    //get value as only numbers
                    let strNum = e.target.value.match(/^[+-]?(\d*\.)?\d+.?$/g)?.toString() //regex from https://stackoverflow.com/questions/10921058/regex-matching-numbers-and-decimals
                    if (!strNum) strNum = ""

                    const proposedValue = strNum

                    const proposedValueNum = proposedValue.length > 0 ? Number(proposedValue) : -100000
                    const withinRange = (proposedValueNum >= min && proposedValueNum <= max) || (!restrictWithinRange && proposedValueNum >= min)

                    if (withinRange && !strNum.endsWith(".")) { //if valid
                        setValue(proposedValueNum)
                        setProposedValue(undefined)
                    } else { //not valid
                        //update proposal
                        setProposedValue(proposedValue)
                    }
                }
            }}></input>
            <button className="clear" onClick={()=>{setValue(normal)}}>
                <Icon>delete</Icon>
            </button>
        </div>
        <SliderInput value={Math.min(mapNum(value, min, max, 0, 1), 1)}
        setValue={(val) => {
            val = mapNum(val, 0, 1, min, max)
            setValue(val)
        }}/>
    </div>
}

//let cameraPosition = RBXRenderer.firstScene.camera.position.clone()
//let cameraQuaternion = RBXRenderer.firstScene.camera.quaternion.clone()

function CameraCategory(): React.JSX.Element {
    const min = 20
    const max = 120

    const [value, setValue] = useState(getCameraData().gposeFov)

    return <>
    <div className="gpose-downward-container">
        <div className="adjust-line"></div>
        {/* Camera position */}
        {/*
        <div className="choice-button-container">
            <RadialButton className="roboto-600 choice-button" onClick={() => {
                cameraPosition = RBXRenderer.firstScene.camera.position.clone()
                cameraQuaternion = RBXRenderer.firstScene.camera.quaternion.clone()
            }}>Save Camera</RadialButton>
            <RadialButton className="roboto-600 choice-button" onClick={() => {
                RBXRenderer.firstScene.camera.position.copy(cameraPosition)
                RBXRenderer.firstScene.camera.quaternion.copy(cameraQuaternion);
            }}>Load Camera</RadialButton>
        </div>
        */}

        <CustomizationSlider name="FOV" min={min} max={max} normal={70} value={value} setValue={(v) => {
            setValue(v)

            const newCameraData = getCameraData().clone()
            newCameraData.gposeFov = v
            setCameraData(newCameraData)
        }}/>
    </div>
    </>
}

const dir1DefaultIntensity = 3.5342917352885173
const dir2DefaultIntensity = 0.3

function LightingCategory(): React.JSX.Element {
    const dir1 = RBXRenderer.firstScene.directionalLight
    const dir2 = RBXRenderer.firstScene.directionalLight2

    const [updateCount, setUpdateCount] = useState<number>(0)

    const sunlightColorRef = useRef<HTMLInputElement | null>(null)
    const moonlightColorRef = useRef<HTMLInputElement | null>(null)

    const [sunlightColor, _setSunlightColor] = useState<string>("#" + RBXRenderer.firstScene.directionalLight?.color.getHexString().toLowerCase())
    const [moonlightColor, _setMoonlightColor] = useState<string>("#" + RBXRenderer.firstScene.directionalLight2?.color.getHexString().toLowerCase())

    const setSunlightColor = useCallback((v: string) => {
        RBXRenderer.firstScene.directionalLight?.color.setStyle(v)

        _setSunlightColor(v)
    }, [])

    const setMoonlightColor = useCallback((v: string) => {
        RBXRenderer.firstScene.directionalLight2?.color.setStyle(v)

        _setMoonlightColor(v)
    }, [])

    if (!dir1 || !dir2) return <></>

    return <>
        <div className="adjust-line"></div>
        {/* Light color */}
        <div className="choice-button-container roboto-600 choice-color-container">
            Sun:
            <input type="color" ref={sunlightColorRef} value={sunlightColor} onChange={() => {
                const value = sunlightColorRef.current?.value
                if (value) setSunlightColor(value)
            }}></input>
            Moon:
            <input type="color" ref={moonlightColorRef} value={moonlightColor} onChange={() => {
                const value = moonlightColorRef.current?.value
                if (value) setMoonlightColor(value)
            }}></input>
        </div>

        <div className="adjust-line"></div>
        {/* Light position */}
        <div className="choice-button-container">
            <RadialButton className="roboto-600 choice-button" onClick={() => {
                dir1.position.set(...new THREE.Vector3(0,0,15).applyQuaternion(RBXRenderer.firstScene.camera.quaternion).toArray())
            }}>Sun at Camera</RadialButton>
            <RadialButton className="roboto-600 choice-button" onClick={() => {
                dir1.position.set(-5,15,-8)
            }}>Reset Sun</RadialButton>
        </div>

        <div className="choice-button-container">
            <RadialButton className="roboto-600 choice-button" onClick={() => {
                dir2.position.set(...new THREE.Vector3(0,0,15).applyQuaternion(RBXRenderer.firstScene.camera.quaternion).toArray())
            }}>Moon at Camera</RadialButton>
            <RadialButton className="roboto-600 choice-button" onClick={() => {
                dir2.position.set(5,-7,5)
            }}>Reset Moon</RadialButton>
        </div>

        <div className="adjust-line"></div>
        {/* Light intensity */}
        <CustomizationSlider name="Sunlight Intensity" restrictWithinMaxRange={false} min={0} max={10} normal={dir1DefaultIntensity} value={dir1.intensity} setValue={(v) => {
            dir1.intensity = v
            setUpdateCount((updateCount + 1) % 10000)
        }}/>
        <CustomizationSlider name="Moonlight Intensity" restrictWithinMaxRange={false} min={0} max={10} normal={dir2DefaultIntensity} value={dir2.intensity} setValue={(v) => {
            dir2.intensity = v
            setUpdateCount((updateCount + 1) % 10000)
        }}/>
    </>
}

function SceneCategory(): React.JSX.Element {
    const [bgColor, _setBgColor] = useState<THREE.ColorRepresentation>(RBXRenderer.backgroundColor)
    const [bgTransparent, _setBgTransparent] = useState<boolean>(RBXRenderer.backgroundTransparent)
    const [showShadow, _setShowShadow] = useState<boolean>(RBXRenderer.firstScene.shadowPlane?.visible || false)
    const [ambientLight, _setAmbientLight] = useState<boolean>(RBXRenderer.firstScene.ambientLight?.visible || false)

    const bgColorRef = useRef<HTMLInputElement | null>(null)

    const setBgColor = useCallback((v: THREE.ColorRepresentation) => {
        RBXRenderer.setBackgroundColor(v)

        _setBgColor(v)
    }, [])

    const setBgTransparent = useCallback((v: boolean) => {
        RBXRenderer.setBackgroundTransparent(v)

        _setBgTransparent(v)
    }, [])

    const setShowShadow = useCallback((v: boolean) => {
        const shadowPlane = RBXRenderer.firstScene.shadowPlane
        if (shadowPlane) shadowPlane.visible = v

        _setShowShadow(v)
    }, [])

    const setAmbientLight = useCallback((v: boolean) => {
        const ambientLight = RBXRenderer.firstScene.ambientLight
        if (ambientLight) ambientLight.visible = v

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const backgroundRenderer = (globalThis as any).backgroundRenderer as BackgroundRenderer
        if (backgroundRenderer) {
            backgroundRenderer.affectSceneLighting = FLAGS.USE_POST_PROCESSING ? v : false
        }

        _setAmbientLight(v)
    }, [])

    const hexColor = "#" + new THREE.Color().set(bgColor).getHexString().toLowerCase()

    return <>
    <div className="gpose-downward-container">
        <div className="adjust-line"></div>
        {/* Background color */}
        <div className="choice-button-container roboto-600 choice-color-container">
            Background Color:
            <input type="color" ref={bgColorRef} value={hexColor} onChange={() => {
                const value = bgColorRef.current?.value
                if (value) setBgColor(value)
            }}></input>
        </div>

        <div className="adjust-line"></div>
        {/* Background transparent */}
        <div className="choice-button-container roboto-600 choice-color-container">
            Background Transparent:
            <ToggleButton value={bgTransparent} setValue={setBgTransparent}/>
        </div>

        <div className="adjust-line"></div>
        {/* Show shadow */}
        <div className="choice-button-container roboto-600 choice-color-container">
            Show Shadow:
            <ToggleButton value={showShadow} setValue={setShowShadow}/>
        </div>

        <div className="adjust-line"></div>
        {/* Ambient Light */}
        <div className="choice-button-container roboto-600 choice-color-container">
            Ambient Light:
            <ToggleButton value={ambientLight} setValue={setAmbientLight}/>
        </div>
    </div>
    </>
}

function exportCanvas(exportName: string, width: number, height: number, format: string = "image/png") {
    RBXRenderer.setRendererSize(Math.ceil(FLAGS.POST_PROCESSING_IS_DOUBLE_SIZE ? width / 2 : width), Math.ceil(FLAGS.POST_PROCESSING_IS_DOUBLE_SIZE ? height / 2 : height))
    RBXRenderer.animateAll(false)

    const canvas = RBXRenderer.getRendererDom()
    if (canvas) {
        canvas.toBlob((blob) => {
            if (blob) {
                const a = document.createElement("a");
                document.body.appendChild(a);
                a.setAttribute("style","display: none;")

                const url = globalThis.URL.createObjectURL(blob);
                a.href = url;
                a.download = exportName;
                a.click();

                a.remove()

                globalThis.URL.revokeObjectURL(url);
            }
        }, format)
    }
}

function ExportCategory(): React.JSX.Element {
    const [format, setFormat] = useState<string>("png")
    const [resolution, setResolution] = useState<string>("1K")

    return <>
    <div className="gpose-downward-container">
        <div className="adjust-line"></div>
        <div className="choice-button-container roboto-600" style={{justifyContent: "space-between"}}>
            <span className="gpose-info-text roboto-600">Image Format:</span>
            <SelectInput value={format} setValue={setFormat} alternatives={["png", "jpeg", "webp"]}/>
        </div>
        <div className="adjust-line"></div>
        <div className="choice-button-container roboto-600" style={{justifyContent: "space-between"}}>
            <span className="gpose-info-text roboto-600">Resolution:</span>
            <SelectInput value={resolution} setValue={setResolution} alternatives={["1K", "2K", "4K"]}/>
        </div>

        <div className="adjust-line"></div>

        <div className="dialog-actions" style={{width: "90%", margin: "12px 0"}}>
            <RadialButton className="dialog-confirm roboto-600" onClick={() => {
                const date = new Date()

                const resolutionValue = resolution === "1K" ? 1024 : resolution === "2K" ? 2048 : 4096

                
                exportCanvas(`RoAvatar Screenshot ${String(date.getDay()).padStart(2,"0")}_${String(date.getMonth()).padStart(2,"0")}_${String(date.getFullYear()).padStart(2,"0")} ${String(date.getHours()).padStart(2,"0")}_${String(date.getMinutes()).padStart(2,"0")}.${format}`,
                            resolutionValue, resolutionValue, `image/${format}`)
            }}>
                Export
            </RadialButton>
        </div>
    </div>
    </>
}

export default function GPose({isOpen}: {isOpen: boolean}): React.JSX.Element {
    const outfitFunc = useContext(OutfitFuncContext)
    const alert = useContext(AlertContext)

    const [style, setStyle] = useState<CSSProperties>({maxHeight: "500px"})

    const [currentCategory, setCurrentCategory] = useState<GPoseCategoryType>("Pose")

    const {animLock, setAnimLock} = outfitFunc
    const lastIsOpen = useRef(false)

    //update top
    useEffect(() => {
        const avatarPreview = document.getElementById("avatar-preview")
        const boundingRect = avatarPreview?.getBoundingClientRect()
        const avatarPreviewBottom = boundingRect?.bottom

        let needsChange = false

        const newStyle = Object.assign({}, style)

        if (window.innerHeight >= 850) { //big resolution
            if (avatarPreviewBottom) {
                const newTop = avatarPreviewBottom
                if (newTop + "px" !== style.top) {
                    newStyle.top = newTop + "px"
                    needsChange = true
                }
            }

            const newLeft = "0px"
            if (newLeft !== style.left) {
                newStyle.left = newLeft
                needsChange = true
            }
        } else { //small resolution
            if (boundingRect) {
                const newLeft = boundingRect.right
                if (newLeft + "px" !== style.left) {
                    newStyle.left = newLeft + "px"
                    needsChange = true
                }

                const newTop = boundingRect.top
                if (newTop + "px" !== style.top) {
                    newStyle.top = newTop + "px"
                    needsChange = true
                }
            }
        }

        if (needsChange) {
            setStyle(newStyle)
        }
    }, [isOpen, style])

    //update on open/close
    useEffect(() => {
        if (lastIsOpen.current !== isOpen) {
            const cameraData = getCameraData()

            if (isOpen) {
                if (!FLAGS.USE_POST_PROCESSING) {
                    if (alert) alert("Setting graphics to High is recommended for Screenshot Mode", 10000, true)
                }

                //background color is set, otherwise the ui gets it wrong???
                const urlParams = new URLSearchParams(window.location.search)
                const theme = urlParams.get("theme")
                RBXRenderer.setBackgroundColor(theme === "light" ? 0xdbdbdc : 0x2b2d33)

                outfitFunc.setCanSetAnimName(false)

                const newCameraData = cameraData.clone()
                newCameraData.transition("GPose")
                setCameraData(newCameraData)

                const dir1 = RBXRenderer.firstScene.directionalLight
                if (dir1) {
                    dir1.shadow.camera.far *= 2
                    dir1.shadow.camera.left *= 2
                    dir1.shadow.camera.right *= 2
                    dir1.shadow.camera.top *= 2
                    dir1.shadow.camera.bottom *= 2
                    dir1.shadow.camera.updateProjectionMatrix()

                    dir1.shadow.mapSize.set(1024, 1024)
                    dir1.shadow.map?.dispose()
                    dir1.shadow.map = null
                    dir1.shadow.needsUpdate = true

                    if (RBXRenderer.renderer) RBXRenderer.renderer.shadowMap.needsUpdate = true
                }
            } else {
                const urlParams = new URLSearchParams(window.location.search)
                const theme = urlParams.get("theme")
                RBXRenderer.setBackgroundColor(theme === "light" ? 0xdbdbdc : 0x2b2d33)
                RBXRenderer.setBackgroundTransparent(false)

                const shadowPlane = RBXRenderer.firstScene.shadowPlane
                if (shadowPlane) shadowPlane.visible = true

                const ambientLight = RBXRenderer.firstScene.ambientLight
                if (ambientLight) ambientLight.visible = true

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const backgroundRenderer = (globalThis as any).backgroundRenderer as BackgroundRenderer
                if (backgroundRenderer) {
                    backgroundRenderer.affectSceneLighting = FLAGS.USE_POST_PROCESSING ? true : false
                }

                outfitFunc.setCanSetAnimName(true)
                outfitFunc.setAnimLock(new AnimLock())
                outfitFunc.setAnimName("idle")

                const dir1 = RBXRenderer.firstScene.directionalLight
                const dir2 = RBXRenderer.firstScene.directionalLight2

                if (dir1) {
                    dir1.intensity = dir1DefaultIntensity
                    dir1.position.set(-5,15,-8)
                    dir1.color.set(0xffffff)

                    dir1.shadow.camera.far /= 2
                    dir1.shadow.camera.left /= 2
                    dir1.shadow.camera.right /= 2
                    dir1.shadow.camera.top /= 2
                    dir1.shadow.camera.bottom /= 2
                    dir1.shadow.camera.updateProjectionMatrix()

                    dir1.shadow.mapSize.set(256, 256)
                    dir1.shadow.map?.dispose()
                    dir1.shadow.map = null
                    dir1.shadow.needsUpdate = true

                    if (RBXRenderer.renderer) RBXRenderer.renderer.shadowMap.needsUpdate = true
                }

                if (dir2) {
                    dir2.intensity = dir2DefaultIntensity
                    dir2.position.set(5,-7,5)
                    dir2.color.set(0xffffff)
                }

                const newCameraData = cameraData.clone()
                newCameraData.transition("Editor")
                setCameraData(newCameraData)
            }

            lastIsOpen.current = isOpen
        }
    }, [outfitFunc, isOpen, alert])

    return <>
        <div className={`thumbnail-adjustment${isOpen ? " open" : ""}`} style={style}>
            <div className="choice-button-container">
                <SelectInput value={currentCategory} setValue={(a: string) => {setCurrentCategory(a as GPoseCategoryType)}} alternatives={GPoseCategoryTypes}/>
            </div>
            {isOpen ? <>
                {currentCategory === "Pose" ? <PoseCategory
                animLock={animLock}
                setAnimLock={setAnimLock}
                /> : null}
                {currentCategory === "Camera" ? <CameraCategory/> : null}
                {currentCategory === "Lighting" ? <LightingCategory/> : null}
                {currentCategory === "Scene" ? <SceneCategory/> : null}
                {currentCategory === "Export" ? <ExportCategory/> : null}
            </> : null}
        </div>
    </>
}