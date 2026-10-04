import { useEffect, useRef, useState } from "react"
import ToggleButton from "./generic/toggleButton"
import RadialButton from "./generic/radialButton";
import Icon from "./generic/icon";
import { Tooltip } from "react-tooltip";
import { setSetting } from "./generic/settings";
import { API, LocalOutfit, Outfit, download } from "roavatar-renderer";

declare const browser: typeof chrome;

function SettingsToggle({text, storage, defaultValue}: {text: string, storage: string, defaultValue: boolean}): React.JSX.Element {
    const [value, _setValue] = useState(defaultValue)

    useEffect(() => {
        (chrome || browser).storage.local.get([storage]).then((result) => {
            let value = defaultValue

            const storageResult = result[storage]
            if (storageResult !== undefined && storageResult !== null) {
                value = storageResult as boolean
            }

            _setValue(value)
        })
    })

    function setValue(newValue: boolean) {
        _setValue(newValue);
        setSetting(storage, newValue)
    }

    return <div className="setting-row">
            <span className="setting-name roboto-400">{text}</span>
            <ToggleButton value={value} setValue={setValue}></ToggleButton>
        </div>
}

export default function SettingsButton(): React.JSX.Element {
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [transferStatus, setTransferStatus] = useState("")

    const settingsDialogRef = useRef<HTMLDialogElement>(null)
    const importInputRef = useRef<HTMLInputElement>(null)

    //export local outfits to a json file (same format as window.downloadLocalOutfits)
    async function exportLocalOutfits() {
        try {
            const localOutfits = await API.LocalOutfit.GetLocalOutfits()
            const outfits = localOutfits.map(outfit => outfit.toJson())
            download("localOutfits.json", JSON.stringify(outfits))
            setTransferStatus(`Exported ${outfits.length} outfits`)
        } catch (e) {
            console.error(e)
            setTransferStatus("Export failed")
        }
    }

    //import local outfits from a json file, merges with existing ones
    async function importLocalOutfits(file: File) {
        try {
            const obj = JSON.parse(await file.text())
            if (!Array.isArray(obj)) throw new Error("Invalid file")

            const existing = await API.LocalOutfit.GetLocalOutfits()
            const seen = new Set(existing.map(o => `${o.name}|${o.date}`))
            const merged = existing.slice()

            let added = 0
            for (const outfitData of obj) {
                const localOutfit = new LocalOutfit(new Outfit())
                localOutfit.fromJson(outfitData)
                const key = `${localOutfit.name}|${localOutfit.date}`
                if (seen.has(key) || merged.length >= 1000) continue
                seen.add(key)
                merged.push(localOutfit)
                added++
            }

            await API.LocalOutfit.SetLocalOutfits(merged)
            setTransferStatus(`Imported ${added} outfits, reloading...`)
            setTimeout(() => {window.location.reload()}, 1000)
        } catch (e) {
            console.error(e)
            setTransferStatus("Import failed, invalid file")
        }
    }

    //update dialog
    useEffect(() => {
        if (settingsOpen) {
            settingsDialogRef.current?.showModal()
        } else {
            settingsDialogRef.current?.close()
        }
    }, [settingsOpen])

    return <>
        {/*Settings button*/}
        <RadialButton className="left-top-button icon-button" data-tooltip-content="Settings" data-tooltip-id="bottom-settings-button" onClick={() => {setSettingsOpen(true)}}>
            <Icon>settings</Icon>
        </RadialButton>
        <Tooltip id="bottom-settings-button"/>

        {/*Settings menu*/}
        <dialog style={settingsOpen ? {opacity: 1} : {display: "none", opacity: 0}} ref={settingsDialogRef} onCancel={() => {setSettingsOpen(false)}}>
            {/*Title and exit button*/}
            <div className="dialog-top">
                <span className="dialog-title roboto-700" style={{margin:0}}>Settings</span>
                <button title="Close" style={{height: "3em"}} className="exit-button icon-button" onClick={() => {setSettingsOpen(false)}}>
                    <Icon>close</Icon>
                </button>
            </div>
            
            {/*Actual settings*/}
            <div className="dialog-line"></div>
            <SettingsToggle text={"High graphics (requires refresh)"} storage="s-postprocessing" defaultValue={false}/>
            <div className="dialog-line"></div>
            <SettingsToggle text={"Save avatar automatically"} storage="s-autosave" defaultValue={false}/>
            <SettingsToggle text={"Make RoAvatar default avatar editor"} storage="s-default" defaultValue={true}/>
            <SettingsToggle text={"Show last unsaved outfit when editor is opened"} storage="s-recovery-outfit" defaultValue={true}/>
            <div className="dialog-line"></div>
            <SettingsToggle text={"Show avatar history on profiles (API)"} storage="s-avatar-history" defaultValue={true}/>
            <SettingsToggle text={"Show avatars made with item in marketplace (API)"} storage="s-avatars-made-with" defaultValue={true}/>
            <div className="dialog-line"></div>
            <div className="setting-row">
                <span className="setting-name roboto-400">Saved characters (local)</span>
                <div className="dialog-actions">
                    <RadialButton className="dialog-confirm roboto-600" onClick={() => {exportLocalOutfits()}}>Export</RadialButton>
                    <RadialButton className="dialog-confirm roboto-600" onClick={() => {importInputRef.current?.click()}}>Import</RadialButton>
                </div>
                <input ref={importInputRef} type="file" accept=".json,application/json" style={{display: "none"}} onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (file) importLocalOutfits(file)
                }}/>
            </div>
            {transferStatus ? <span className="dialog-text roboto-400">{transferStatus}</span> : null}
        </dialog>
    </>
}