import fs from 'fs';
import { ItemContainer } from '../models/containers';
import { MenuItem } from "../models/items";


export abstract class DataProvider {
    abstract addContainer(container: ItemContainer): ItemContainer;
    abstract getContainer(id: number): ItemContainer | null;
    
    abstract addItem(item: MenuItem): MenuItem;
    abstract getItem(id: number): MenuItem | null;
}

export class LocalDataProvider extends DataProvider {
    CONTAINERS_KEY = "containers";
    ITEMS_KEY = "items";

    dataFolder: string;
    _cache: Map<string, Map<number, any>>;

    constructor(dataFolder: string) {
        super();
        this.dataFolder = dataFolder;
        this._cache = new Map;
        this._cache.set(this.CONTAINERS_KEY, new Map);
        this._cache.set(this.ITEMS_KEY, new Map);
        this.loadFromFile();
    }

    loadFromFile() {
        if (fs.existsSync(this.dataFolder)) {
            fs.readdirSync(this.dataFolder).forEach((file: string) => {
                if (file === "items.json") {
                    const data = fs.readFileSync(`${this.dataFolder}/${file}`, "utf-8");
                    const parsedData = JSON.parse(data);
                    const itemsMap = this._cache.get(this.ITEMS_KEY)!;
                    parsedData.forEach((entry: { id: number; internalName: string; displayName: string; brewery: string; style: string; abv: number; description: string; category: string; containers: number[]; }) => {
                        const newItem = new MenuItem(entry.id, entry.internalName, entry.displayName, entry.brewery, entry.style, entry.abv, entry.description, entry.category, entry.containers);
                        itemsMap.set(newItem.id, newItem);
                    });
                }
                if (file === "containers.json") {
                    const data = fs.readFileSync(`${this.dataFolder}/${file}`, "utf-8");
                    const parsedData = JSON.parse(data);
                    const containersMap = this._cache.get(this.CONTAINERS_KEY)!;
                    parsedData.forEach((entry: { id: number, containerName: string, displayName: string, price: number }) => {
                        const newItem = new ItemContainer(entry.id, entry.containerName, entry.displayName, entry.price);
                        containersMap.set(newItem.id, newItem);
                    });
                }
            });
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

    addContainer(container: ItemContainer): ItemContainer {
        return this.addGeneric(container, this.CONTAINERS_KEY);
    }

    getContainer(id: number): ItemContainer | null {
        return this.getGeneric(id, this.CONTAINERS_KEY);
    }

    addItem(item: MenuItem): MenuItem {
        return this.addGeneric(item, this.ITEMS_KEY);
    }

    getItem(id: number): MenuItem | null {
        return this.getGeneric(id, this.ITEMS_KEY);
    }
}
