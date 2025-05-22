// Represents the type of container an item might be in
export class ItemContainer {
    id: number;
    containerName: string;
    displayName: string;
    price: number;

    constructor(id: number, containerName: string, displayName: string, price: number){
        this.id = id;
        this.containerName = containerName;
        this.displayName = displayName;
        this.price = price;
    }
}
