// Represents a generic type of menu item (food, beverage, etc.)
export class Item {
    id: number;
    internalName: string;
    displayName: string;
    // Brewery ID is optional since some of our stuff are things like pretzels
    breweryId: number | null;
    style: string;
    abv: number;
    description: string;
    // Which menu this should appear on, e.g., "beer", "NA", or "snacks"
    category: string;

    constructor(id: number, internalName: string, displayName: string, breweryId: number | null, style: string, abv: number, description: string, menuCategory: string) {
        this.id = id;
        this.internalName = internalName;
        this.displayName = displayName;
        this.breweryId = breweryId;
        this.style = style;
        this.abv = abv;
        this.description = description;
        this.category = menuCategory;
    }

    static fromJsonEntry(entry: any): Item {
        return new Item(entry.id, entry.internalName, entry.displayName, entry.breweryId, entry.style, entry.abv, entry.description, entry.category);
    }
}