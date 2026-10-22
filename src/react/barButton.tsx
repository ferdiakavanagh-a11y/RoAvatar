import Icon from "./generic/icon"

export default function BarButton({currentCategory, category, setCategory}:{currentCategory?: string, category: string, setCategory: (a: string) => void}): React.JSX.Element {
    const iconOnly = category === "Favorites"
    const className = `bar-button roboto-600${category===currentCategory ? " bar-button-selected" : ""}${iconOnly ? " bar-button-icon-only" : ""}`
    const onClick = () => {setCategory(category)}
    let icon = undefined
    switch (category) {
        case "Marketplace":
            icon = <Icon>shopping_basket</Icon>
            break
        case "Inventory":
            icon = <Icon>backpack</Icon>
            break
        case "Favorites":
            icon = <Icon>star</Icon>
            break
    }

    return <button className={className} title={icon ? category : undefined} aria-label={category} aria-pressed={category === currentCategory} onClick={onClick}>{icon}{!iconOnly && <span className={`${icon ? " hide-max-width-1150" : ""}`}>{category}</span>}</button>
}