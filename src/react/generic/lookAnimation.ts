import { CFrame, dot, lerpCFrame, lerpVec3, multiply, normalize, RBXRenderer, specialClamp, Vector3, type BasePartWrapper, type Instance, type Vec3 } from "roavatar-renderer";

export function rigFaceTarget(rig: Instance, target: Vec3, weight: number) {
    const head = rig.Child("Head")
    const upperTorso = rig.Child("UpperTorso")
    const hrp = rig.Child("HumanoidRootPart")

    if (!head || !upperTorso || !hrp || !RBXRenderer.firstScene.camera) return 0

    const headNode = (head.w as BasePartWrapper).GetAssemblyNode()
    const upperTorsoNode = (upperTorso.w as BasePartWrapper).GetAssemblyNode()

    const headMotor = headNode.getParentConnector()
    const upperTorsoMotor = upperTorsoNode.getParentConnector()
    if (!headMotor || !upperTorsoMotor || !headMotor.HasProperty("Transform") || !upperTorsoMotor.HasProperty("Transform")) return 0

    //calculate cframe
    const originLV = headNode.traversedRestCFrame.lookVector()
    const headCF = CFrame.lookAt((head.Prop("CFrame") as CFrame).Position, target).rotationOnly()
    const headLV = headCF.lookVector()

    const headLVXZ = normalize(multiply(headLV, [1,1,1]))

    const valXZ = specialClamp(dot(originLV, headLVXZ), 0, 0.3) * 1/0.3
    const newXZ = lerpVec3(new Vector3(...originLV), new Vector3(...headLVXZ), valXZ).toVec3()

    const newLV = normalize([newXZ[0], newXZ[1], newXZ[2]])
    const targetHeadCF = CFrame.lookAt([0,0,0], newLV)

    //set resulting cframes
    const resultHeadCF = lerpCFrame(headMotor.Prop("Transform") as CFrame, targetHeadCF.inverse(), weight * 0.6)

    headMotor.setProperty("Transform", resultHeadCF)
    upperTorsoMotor.setProperty("Transform", lerpCFrame(upperTorsoMotor.Prop("Transform") as CFrame, targetHeadCF.inverse(), weight * 0.4))

    return valXZ
}