import { useContext } from "react";
import { OutfitFuncContext } from "./context/outfit-context";
import SelectInput from "./generic/selectInput";
import { AvatarType } from "roavatar-renderer";
import { capitalizeFirstLetter, R15_Animations, R6_Animations } from "./generic/animation";



export default function AnimationPicker(): React.JSX.Element  {
    const outfitFunc = useContext(OutfitFuncContext)

    const isR6 = outfitFunc.outfitModel.outfit.playerAvatarType === AvatarType.R6
    const alternatives = isR6 ? 
        R6_Animations : 
        R15_Animations
    alternatives.reverse() //i dont like the most important ones being at the top
    const fixedAnimName = capitalizeFirstLetter(outfitFunc.animName)

    return <SelectInput
    className={"animation-picker"}
    value={alternatives.includes(fixedAnimName) ? fixedAnimName : "..."}
    setValue={(v) => {outfitFunc.setAnimName(v.toLowerCase())}}
    isUp={true}
    alternatives={alternatives}/>
}