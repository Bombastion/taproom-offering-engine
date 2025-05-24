import fs from 'fs';
import { ItemContainer, SaleContainer } from '../models/containers';
import { Item } from "../models/items";


export abstract class DataProvider {
    abstract addContainer(container: ItemContainer): ItemContainer;
    abstract getContainer(id: number): ItemContainer | null;

    abstract addSaleContainer(container: SaleContainer): SaleContainer;
    abstract getSaleContainer(id: number): SaleContainer | null;
    // Deletes a sale container. Returns true if the item was removed, and false if it didn't exist.
    abstract removeSaleContainer(id: number): boolean;

    abstract addItem(item: Item): Item;
    abstract getItem(id: number): Item | null;
}

export class LocalDataProvider extends DataProvider {
    CONTAINERS_KEY = "containers";
    SALE_CONTAINERS_KEY = "saleContainers";
    ITEMS_KEY = "items";

    dataFolder: string;
    _cache: Map<string, Map<number, any>>;

    constructor(dataFolder: string) {
        super();
        this.dataFolder = dataFolder;
        this._cache = new Map;
        this._cache.set(this.CONTAINERS_KEY, new Map);
        this._cache.set(this.SALE_CONTAINERS_KEY, new Map);
        this._cache.set(this.ITEMS_KEY, new Map);
        this.loadFromFile();
    }

    loadFromFile() {
        if (fs.existsSync(this.dataFolder)) {
            const filesInFolder = fs.readdirSync(this.dataFolder);
            // Data must be loaded in a particular order to account for join table logic
            if (filesInFolder.includes("items.json")) {
                const data = fs.readFileSync(`${this.dataFolder}/items.json`, "utf-8");
                const parsedData = JSON.parse(data);
                const itemsMap = this._cache.get(this.ITEMS_KEY)!;
                parsedData.forEach((entry: { id: number; internalName: string; displayName: string; brewery: string; style: string; abv: number; description: string; category: string; containers: number[]; }) => {
                    const newItem = new Item(entry.id, entry.internalName, entry.displayName, entry.brewery, entry.style, entry.abv, entry.description, entry.category);
                    itemsMap.set(newItem.id, newItem);
                });
            }
            if (filesInFolder.includes("containers.json")) {
                const data = fs.readFileSync(`${this.dataFolder}/containers.json`, "utf-8");
                const parsedData = JSON.parse(data);
                const containersMap = this._cache.get(this.CONTAINERS_KEY)!;
                parsedData.forEach((entry: { id: number, containerName: string, displayName: string }) => {
                    const newItem = new ItemContainer(entry.id, entry.containerName, entry.displayName);
                    containersMap.set(newItem.id, newItem);
                });
            }
            if (filesInFolder.includes("saleContainers.json")) {
                const data = fs.readFileSync(`${this.dataFolder}/saleContainers.json`, "utf-8");
                const parsedData = JSON.parse(data);
                const containersMap = this._cache.get(this.SALE_CONTAINERS_KEY)!;
                parsedData.forEach((entry: { id: number, containerId: number, itemId: number, price: number }) => {
                    const newItem = new SaleContainer(entry.id, entry.containerId, entry.itemId, entry.price);
                    containersMap.set(newItem.id, newItem);
                });
            }
        }
    }

    getLatestIdForMap(map: Map<number, any>): number {
        let highestKey = 0;
        for (const key of map.keys()) {
            if (key > highestKey) {
                highestKey = key;
            }
        }
        return highestKey + 1;
    }

    addGeneric(toAdd: any, mapName: string): any {
        /*
            Adds a new item to the given map and returns the updated item with a new ID
        */
        const addMap = this._cache.get(mapName)!;
        const newId = this.getLatestIdForMap(addMap);
        toAdd.id = newId;
        addMap.set(toAdd.id, toAdd);

        return toAdd;
    }

    getGeneric(id: number, mapName: string): any {
        const result = this._cache.get(mapName)!.get(id);
        if (!result) {
            return null;
        }

        return result;
    }

    idExists(id: number, mapName: string): boolean {
        const result = this.getGeneric(id, mapName);
        if (result !== null) {
            return true;
        }
        return false;
    }

    addContainer(container: ItemContainer): ItemContainer {
        return this.addGeneric(container, this.CONTAINERS_KEY);
    }

    getContainer(id: number): ItemContainer | null {
        return this.getGeneric(id, this.CONTAINERS_KEY);
    }

    addSaleContainer(container: SaleContainer): SaleContainer {
        // As with any "join" object, we need to validate the IDs being entered
        // TODO: would be much nicer with a relational DB
        if (!this.idExists(container.containerId, this.CONTAINERS_KEY)) {
            // TODO: Look up error handling best practices
            // A cursory skim suggests I'll need to refactor a lot of this code
            console.log(`TODO: Do an error here because ID ${container.containerId} does not exist for containers`)
        }
        if (!this.idExists(container.itemId, this.ITEMS_KEY)) {
            console.log(`TODO: Do an error here because ID ${container.itemId} does not exist for items`)
        }
        return this.addGeneric(container, this.SALE_CONTAINERS_KEY);
    }

    getSaleContainer(id: number): SaleContainer | null {
        return this.getGeneric(id, this.SALE_CONTAINERS_KEY);
    }

    removeSaleContainer(id: number): boolean {
        const containerMap = this._cache.get(this.SALE_CONTAINERS_KEY)!;
        if (!containerMap!.has(id)) {
            return false;
        }
        containerMap.delete(id);
        return true;
    }

    addItem(item: Item): Item {
        // TODO: Check for "name/brewery name" combo uniqueness
        return this.addGeneric(item, this.ITEMS_KEY);
    }

    getItem(id: number): Item | null {
        return this.getGeneric(id, this.ITEMS_KEY);
    }
}
