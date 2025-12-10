import fs from 'fs';
import { ItemContainer, SaleContainer } from '../models/containers';
import { Item } from "../models/items";
import { Brewery } from '../models/breweries';
import { Menu, MenuItem, SubMenu } from '../models/menus';
import { EntryType } from 'perf_hooks';


export abstract class DataProvider {
    abstract addBrewery(brewery: Brewery): Brewery;
    abstract getBrewery(id: number): Brewery | null;

    abstract addContainer(container: ItemContainer): ItemContainer;
    abstract getContainer(id: number): ItemContainer | null;

    abstract addSaleContainer(container: SaleContainer): SaleContainer;
    abstract getSaleContainer(id: number): SaleContainer | null;
    abstract getSaleContainersForItem(itemId: number): Array<SaleContainer>;
    // Deletes a sale container. Returns true if the item was removed, and false if it didn't exist.
    abstract removeSaleContainer(id: number): boolean;

    abstract addItem(item: Item): Item;
    abstract getItem(id: number): Item | null;

    abstract addMenu(menu: Menu): Menu;
    abstract getMenu(id: number): Menu | null;
    
    abstract addSubMenu(menu: SubMenu): SubMenu;
    abstract getSubMenu(id: number): SubMenu | null;
    // Gets all sub-menus for a menu, ordered by "order"
    abstract getSubMenusForMenu(menuId: number): Array<SubMenu>;
    
    abstract addMenuItem(item: MenuItem): MenuItem;
    abstract getMenuItem(id: number): MenuItem | null;
    abstract getMenuItemsForMenu(menuId: number): Array<MenuItem>;
}

export class LocalDataProvider extends DataProvider {
    BREWERIES_KEY = "breweries";
    CONTAINERS_KEY = "containers";
    SALE_CONTAINERS_KEY = "saleContainers";
    ITEMS_KEY = "items";
    MENU_ITEMS_KEY = "menuItems";
    MENUS_KEY = "menus";
    SUBMENUS_KEY = "submenus";

    dataFolder: string;
    _cache: Map<string, Map<number, any>>;

    constructor(dataFolder: string) {
        super();
        this.dataFolder = dataFolder;
        this._cache = new Map;
        this._cache.set(this.BREWERIES_KEY, new Map);
        this._cache.set(this.CONTAINERS_KEY, new Map);
        this._cache.set(this.SALE_CONTAINERS_KEY, new Map);
        this._cache.set(this.ITEMS_KEY, new Map);
        this._cache.set(this.MENU_ITEMS_KEY, new Map);
        this._cache.set(this.MENUS_KEY, new Map);
        this._cache.set(this.SUBMENUS_KEY, new Map);
        this.loadFromFile();
    }

    handleListJsonImport(validFileNames: Array<string>, filename: string, objectConstructor: Function, addCallback: Function): void {
        if (validFileNames.includes(filename)) {
            const data = fs.readFileSync(`${this.dataFolder}/${filename}`, "utf-8");
            const parsedData = JSON.parse(data);
            parsedData.forEach((entry: any) => {
                const newItem = objectConstructor(entry);
                addCallback(newItem);
            });
        }
    }

    loadFromFile() {
        if (fs.existsSync(this.dataFolder)) {
            const filesInFolder = fs.readdirSync(this.dataFolder);
            // Data must be loaded in a particular order to account for join table logic
            this.handleListJsonImport(filesInFolder, "breweries.json", Brewery.fromJsonEntry, this.addBrewery.bind(this));
            this.handleListJsonImport(filesInFolder, "items.json", Item.fromJsonEntry, this.addItem.bind(this));
            this.handleListJsonImport(filesInFolder, "containers.json", ItemContainer.fromJsonEntry, this.addContainer.bind(this));
            this.handleListJsonImport(filesInFolder, "saleContainers.json", SaleContainer.fromJsonEntry, this.addSaleContainer.bind(this));
            this.handleListJsonImport(filesInFolder, "menus.json", Menu.fromJsonEntry, this.addMenu.bind(this));
            this.handleListJsonImport(filesInFolder, "subMenus.json", SubMenu.fromJsonEntry, this.addSubMenu.bind(this));
            this.handleListJsonImport(filesInFolder, "menuItems.json", MenuItem.fromJsonEntry, this.addMenuItem.bind(this));
        }
    }

    getIdForAdd(map: Map<number, any>, existingId: number | null): number {
        if (existingId !== 0 && existingId !== null){
            return existingId;
        }
        return this.getLatestIdForMap(map);
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
        const newId = this.getIdForAdd(addMap, toAdd.id);
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

    addBrewery(brewery: Brewery): Brewery {
        return this.addGeneric(brewery, this.BREWERIES_KEY);
    }

    getBrewery(id: number): Brewery | null {
        return this.getGeneric(id, this.BREWERIES_KEY);
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

    getSaleContainersForItem(itemId: number): Array<SaleContainer> {
        const saleContainers = this._cache.get(this.SALE_CONTAINERS_KEY)!;
        const results: Array<SaleContainer> = [];
        saleContainers.forEach((value: SaleContainer) => {
            if (value.itemId === itemId) {
                results.push(value);
            }
        });

        return results;
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
        if (item.breweryId !== null && !this.idExists(item.breweryId, this.BREWERIES_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.breweryId} does not exist for breweries when adding ${item.id}`)
        }
        return this.addGeneric(item, this.ITEMS_KEY);
    }

    getItem(id: number): Item | null {
        return this.getGeneric(id, this.ITEMS_KEY);
    }

    addMenu(menu: Menu): Menu {
        return this.addGeneric(menu, this.MENUS_KEY);
    }

    getMenu(id: number): Menu | null {
        return this.getGeneric(id, this.MENUS_KEY);
    }

    addSubMenu(menu: SubMenu): SubMenu {
        if (!this.idExists(menu.menuId, this.MENUS_KEY)) {
            console.log(`TODO: Do an error here because ID ${menu.menuId} does not exist for menus`);
        }

        return this.addGeneric(menu, this.SUBMENUS_KEY);
    }

    getSubMenu(id: number): SubMenu | null {
        return this.getGeneric(id, this.SUBMENUS_KEY);
    }

    getSubMenusForMenu(menuId: number): Array<SubMenu> {
        const subMenus = this._cache.get(this.SUBMENUS_KEY)!;
        const results: Array<SubMenu> = [];
        subMenus.forEach((value: SubMenu) => {
            if (value.menuId === menuId) {
                results.push(value);
            }
        });

        results.sort((a: SubMenu, b: SubMenu) => a.order - b.order);
        return results;
    }

    addMenuItem(item: MenuItem): MenuItem {
        if (!this.idExists(item.menuId, this.MENUS_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.menuId} does not exist for menus`);
        }
        if (!this.idExists(item.itemId, this.ITEMS_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.itemId} does not exist for items`);
        }
        if (item.subMenuId !== null && !this.idExists(item.itemId, this.ITEMS_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.subMenuId} does not exist for submenus`);
        }

        return this.addGeneric(item, this.MENU_ITEMS_KEY);
    }

    getMenuItem(id: number): MenuItem | null {
        return this.getGeneric(id, this.MENU_ITEMS_KEY);
    }

    getMenuItemsForMenu(menuId: number): Array<MenuItem> {
        const itemMap = this._cache.get(this.MENU_ITEMS_KEY)!;
        const results: Array<MenuItem> = [];
        itemMap.forEach((value: MenuItem) => {
            if (value.menuId === menuId) {
                results.push(value);
            }
        });

        return results;
    }
}
