// Represents the type of container an item might be in
export class ItemContainer {
    id: number;
    // Represents the type of container, e.g., "Craftmaster" or "Crowler"
    containerName: string;
    // How we would like the container to show up in the system, e.g., "Full Pour" or "Taster"
    displayName: string;
    price: number;

    constructor(id: number, containerName: string, displayName: string, price: number){
        this.id = id;
        this.containerName = containerName;
        this.displayName = displayName;
        this.price = price;
    }
}
