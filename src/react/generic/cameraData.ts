import { CFrame, deg, RBXRenderer, Event, lerp, type Vec3 } from "roavatar-renderer"
import type { AdjustType } from "../accessoryAdjustment"

export type CameraDataType = "Editor" | "AvatarHeadshot" | "Avatar" | "AvatarHeadshotLegacy" | "AvatarLegacy" | "GPose"
export class CameraData {
    /**
     * IMPORTANT!!!!
     * When adding anything here REMEMBER to add it to CLONE or youll be debugging for hours
     */

    canFocus: boolean = true
    type: CameraDataType = "Editor"
    transitionStart: number = 0
    previousCF: CFrame = new CFrame()

    previousFov: number = 70
    editorFov: number = 70 //28.81402587890625

    transitionTime: number = 0.25

    //thumbnail only
    thumbnailFov: number = 28.81402587890625
    yRot: number = 0
    distanceScale: number = 1
    legacyFov: number = 70

    //accessory adjustment
    adjustmentType: AdjustType = "position"
    adjustmentId: bigint = -1n
    adjustmentOpen: boolean = false

    //gpose
    gposeFov: number = 70
    gposeFacePos: Vec3 = [0,0,0]
    gposeFaceWeight: number = 0

    previousFaceWeight: number = 0

    getPassedTransitionTime() {
        const currentTime = Date.now() / 1000
        return currentTime - this.transitionStart
    }

    getNormalizedPassedTransitionTime() {
        return this.getPassedTransitionTime() / this.transitionTime
    }

    isTransition() {
        return this.getPassedTransitionTime() < this.transitionTime
    }

    get fov() {
        const normTransitionTime = this.getNormalizedPassedTransitionTime()
        let targetFov = this.editorFov
        if (this.type === "AvatarHeadshot" || this.type === "Avatar") targetFov = this.thumbnailFov
        if (this.type === "AvatarHeadshotLegacy" || this.type === "AvatarLegacy") targetFov = this.legacyFov
        if (this.type === "GPose") targetFov = this.gposeFov
        const fov = this.isTransition() ? lerp(this.previousFov, targetFov, normTransitionTime) : targetFov
        return fov
    }

    get faceWeight() {
        const normTransitionTime = this.getNormalizedPassedTransitionTime()
        const targetFaceWeight = this.type === "GPose" ? this.gposeFaceWeight : 0
        return this.isTransition() ? lerp(this.previousFaceWeight, targetFaceWeight, normTransitionTime) : targetFaceWeight
    }

    get rotateBackground() {
        return this.type !== "Editor"
    }

    updatePreviousCF() {
        const camera = RBXRenderer.getRendererCamera()
        const camPos = camera.position
        let camEuler = camera.rotation.clone()
        camEuler = camEuler.reorder("YXZ")

        const cf = new CFrame()
        cf.Position = [...camPos.toArray()]
        cf.Orientation = [deg(camEuler.x), deg(camEuler.y), deg(camEuler.z)]

        this.previousCF = cf
    }

    transition(type: CameraDataType) {
        if (type === this.type) return

        this.previousFov = this.fov //has to be at the start so it calculates correctly
        this.previousFaceWeight = this.faceWeight
        this.type = type
        this.canFocus = ["Editor", "GPose"].includes(type)
        this.transitionStart = Date.now() / 1000
        this.updatePreviousCF()
    }

    clone() {
        const copy = new CameraData()
        copy.canFocus = this.canFocus
        copy.type = this.type
        copy.transitionStart = this.transitionStart
        copy.previousCF = this.previousCF.clone()

        copy.previousFov = this.previousFov
        copy.editorFov = this.editorFov

        copy.transitionTime = this.transitionTime

        copy.thumbnailFov = this.thumbnailFov
        copy.yRot = this.yRot
        copy.distanceScale = this.distanceScale
        copy.legacyFov = this.legacyFov

        copy.adjustmentType = this.adjustmentType
        copy.adjustmentId = this.adjustmentId
        copy.adjustmentOpen = this.adjustmentOpen

        copy.gposeFov = this.gposeFov
        copy.gposeFacePos = [...this.gposeFacePos]
        copy.gposeFaceWeight = this.gposeFaceWeight

        copy.previousFaceWeight = this.previousFaceWeight

        return copy
    }
}

let currentCameraData = new CameraData()

export const onCameraDataChange = new Event()

export function getCameraData() {
    return currentCameraData
}

export function setCameraData(newCameraData: CameraData) {
    currentCameraData = newCameraData
    onCameraDataChange.Fire(newCameraData)
}