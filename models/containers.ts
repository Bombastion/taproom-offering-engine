// Represents the type of container an item might be in
export class ItemContainer {
    id: number;
    // Represents the type of container, e.g., "Craftmaster" or "Crowler"
    containerName: string;
    // How we would like the container to show up in the system, e.g., "Full Pour" or "Taster"
    displayName: string;

    constructor(id: number, containerName: string, displayName: string){
        this.id = id;
        this.containerName = containerName;
        this.displayName = displayName;
    }

    static fromJsonEntry(entry: any): ItemContainer {
        return new ItemContainer(entry.id, entry.containerName, entry.displayName);
    }
}

// Represents a specific container of an item marked for sale
export class SaleContainer {
    id: number;
    containerId: number;
    itemId: number;
    price: number;

    constructor(id: number, containerId: number, itemId: number, price: number) {
        this.id = id;
        this.containerId = containerId;
        this.itemId = itemId;
        this.price = price;
    }

    static fromJsonEntry(entry: any): SaleContainer {
        return new SaleContainer(entry.id, entry.containerId, entry.itemId, entry.price);
    }
}
