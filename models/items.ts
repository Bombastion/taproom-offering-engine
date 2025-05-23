// Represents a generic type of menu item (food, beverage, etc.)
export class MenuItem {
    id: number;
    internalName: string;
    displayName: string;
    brewery: string;
    style: string;
    abv: number;
    description: string;
    // Which menu this should appear on, e.g., "beer", "NA", or "snacks"
    category: string;
    // Array of IDs to container objects
    containers: Array<number>;

    constructor(id: number, internalName: string, displayName: string, breweryName: string, style: string, abv: number, description: string, menuCategory: string, containers: Array<number>) {
        this.id = id;
        this.internalName = internalName;
        this.displayName = displayName;
        this.brewery = breweryName;
        this.style = style;
        this.abv = abv;
        this.description = description;
        this.category = menuCategory;
        this.containers = containers;
    }
}