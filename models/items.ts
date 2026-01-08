// Represents a generic type of menu item (food, beverage, etc.)
export class Item {
    id: number | null;
    internalName: string | null;
    displayName: string | null;
    // Brewery ID is optional since some of our stuff are things like pretzels
    breweryId: number | null | null;
    style: string | null;
    abv: number | null;
    description: string | null;
    // Which menu this should appear on, e.g., "beer", "NA", or "snacks"
    category: string | null;

    constructor(id: number| null, internalName: string| null, displayName: string| null, breweryId: number | null| null, style: string| null, abv: number| null, description: string| null, menuCategory: string| null) {
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