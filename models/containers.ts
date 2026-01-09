// Represents the type of container an item might be in
export class ItemContainer {
    id: number | null;
    // Represents the type of container, e.g., "Craftmaster" or "Crowler"
    containerName: string | null;
    // How we would like the container to show up in the system, e.g., "Full Pour" or "Taster"
    displayName: string | null;
    // The order we'd like this to show up in columns on a menu, ascending
    order: number | null;

    constructor(id: number | null, containerName: string | null, displayName: string | null, order: number | null){
        this.id = id;
        this.containerName = containerName;
        this.displayName = displayName;
        this.order = order;
    }

    static fromJsonEntry(entry: any): ItemContainer {
        return new ItemContainer(entry.id, entry.containerName, entry.displayName, entry.order);
    }
}

// Represents a specific container of an item marked for sale
export class SaleContainer {
    id: number;
    containerId: number;
    menuItemId: number;
    price: number;

    constructor(id: number, containerId: number, menuItemId: number, price: number) {
        this.id = id;
        this.containerId = containerId;
        this.menuItemId = menuItemId;
        this.price = price;
    }

    static fromJsonEntry(entry: any): SaleContainer {
        return new SaleContainer(entry.id, entry.containerId, entry.menuItemId, entry.price);
    }
}
