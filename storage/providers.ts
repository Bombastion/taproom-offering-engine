import fs from 'fs';
import { ItemContainer } from '../models/containers';
import { MenuItem } from "../models/items";


export abstract class DataProvider {
    abstract getContainer(id: number): ItemContainer | null;
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
                    parsedData.forEach((entry: { id: number; internalName: string; displayName: string; brewery: string; style: string; abv: number; description: string; menuCategory: string; containers: number[]; }) => {
                        const newItem = new MenuItem(entry.id, entry.internalName, entry.displayName, entry.brewery, entry.style, entry.abv, entry.description, entry.menuCategory, entry.containers);
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

    getContainer(id: number): ItemContainer | null {
        return this._cache.get(this.CONTAINERS_KEY)!.get(id);
    }

    getItem(id: number): MenuItem | null {
        return this._cache.get(this.ITEMS_KEY)!.get(id);
    }
}
