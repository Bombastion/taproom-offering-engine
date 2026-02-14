import fs from 'fs';
import { ItemContainer, SaleContainer } from '../models/containers';
import { Item } from "../models/items";
import { Brewery } from '../models/breweries';
import { Menu, MenuItem, SubMenu } from '../models/menus';
import {v4 as uuidv4} from 'uuid';
import { PrismaClient } from '../generated/prisma/client';

export class DataProviderError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message); 
        this.statusCode = statusCode;
    }
}

export abstract class DataProvider {
    abstract addBrewery(brewery: Brewery): Promise<Brewery>;
    abstract getBrewery(id: string): Promise<Brewery | null>;
    abstract getBreweries(): Promise<Array<Brewery>>;
    abstract updateBrewery(breweryId: string, brewery: Brewery): Promise<Brewery>;

    abstract addContainer(container: ItemContainer): Promise<ItemContainer>;
    abstract getContainer(id: string): Promise<ItemContainer | null>;
    abstract getContainers(): Promise<Array<ItemContainer>>;
    abstract updateContainer(containerId: string, container: ItemContainer): Promise<ItemContainer>;

    abstract addSaleContainer(container: SaleContainer): Promise<SaleContainer>;
    abstract getSaleContainer(id: string): Promise<SaleContainer | null>;
    abstract getSaleContainersForMenuItem(itemId: string): Promise<Array<SaleContainer>>;
    // Deletes a sale container. Returns true if the item was removed, and false if it didn't exist.
    abstract removeSaleContainer(id: string): Promise<boolean>;

    abstract addItem(item: Item): Promise<Item>;
    abstract getItem(id: string): Promise<Item | null>;
    abstract getItems(): Promise<Array<Item>>;
    abstract updateItem(itemId: string, item: Item): Promise<Item>;

    abstract addMenu(menu: Menu): Menu;
    abstract getMenu(id: string): Menu | null;
    abstract getMenus(): Array<Menu>;
    abstract updateMenu(id: string, menu: Menu): Menu;
    
    abstract addSubMenu(menu: SubMenu): SubMenu;
    abstract getSubMenu(id: string): SubMenu | null;
    // Gets all sub-menus for a menu, ordered by "order"
    abstract getSubMenusForMenu(menuId: string): Array<SubMenu>;
    abstract updateSubMenu(id: string, subMenu: SubMenu): SubMenu;
    
    abstract addMenuItem(item: MenuItem): MenuItem;
    abstract getMenuItem(id: string): MenuItem | null;
    abstract getMenuItemsForMenu(menuId: string): Array<MenuItem>;
    abstract getMenuItemsForSubMenu(subMenuId: string): Array<MenuItem>;
    abstract removeMenuItem(id: string): boolean;
    abstract updateMenuItem(id: string, item: MenuItem): MenuItem;
}

export class PrismaDataProvider extends DataProvider {
    prismaClient: PrismaClient

    constructor(prisma: PrismaClient) {
        super();
        this.prismaClient = prisma;
    }

    async addBrewery(brewery: Brewery): Promise<Brewery> {
        return await this.prismaClient.brewery.create({
            data: {
                name: brewery.name!!,
                defaultLogo: brewery.defaultLogo,
                location: brewery.location
            }
        })
    }

    async getBrewery(id: string): Promise<Brewery | null> {
        return await this.prismaClient.brewery.findUnique({
            where: {
                id: id
            }
        });
    }

    async getBreweries(): Promise<Array<Brewery>> {
        return await this.prismaClient.brewery.findMany();
    }

    async updateBrewery(breweryId: string, brewery: Brewery): Promise<Brewery> {
        const original = await this.getBrewery(breweryId);
        if (!original) {
            throw new DataProviderError(`Brewery with ID ${breweryId} does not exist`, 404);
        }
        const updateResult = await this.prismaClient.brewery.update({
            where: {
                id: breweryId
            },
            data: {
                name: brewery.name ? brewery.name : original.name!!,
                location: brewery.location ? brewery.location : original.location,
                defaultLogo: brewery.defaultLogo ? brewery.defaultLogo : original.defaultLogo
            }
        })

        return updateResult; 
    }

    async addContainer(container: ItemContainer): Promise<ItemContainer> {
        return await this.prismaClient.itemContainer.create({
            data: {
                containerName: container.containerName!!,
                displayName: container.displayName!!,
                order: container.order
            }
        })
    }

    async getContainer(id: string): Promise<ItemContainer | null> {
        return await this.prismaClient.itemContainer.findUnique({
            where: {
                id: id
            }
        })
    }

    async getContainers(): Promise<Array<ItemContainer>> {
        return await this.prismaClient.itemContainer.findMany();
    }

    async updateContainer(containerId: string, container: ItemContainer): Promise<ItemContainer> {
        const original = await this.getContainer(containerId);
        if (!original) {
            throw new DataProviderError(`ItemContainer with ID ${containerId} does not exist`, 404);
        }
        const updateResult = await this.prismaClient.itemContainer.update({
            where: {
                id: containerId
            },
            data: {
                containerName: container.containerName? container.containerName : original.containerName!!,
                displayName: container.displayName? container.displayName : original.displayName!!,
                order: container.displayName? container.order : original.order
            }
        });

        return updateResult;
    }

    async addSaleContainer(container: SaleContainer): Promise<SaleContainer> { 
        if (!(await this.getContainer(container.containerId))) {
            throw new DataProviderError(`Container with ID ${container.containerId} doesn't exist when adding new SaleContainer`, 404);
        }
        if (!(await this.getMenuItem(container.menuItemId))) {
            throw new DataProviderError(`MenuItem with ID ${container.menuItemId} doesn't exist when adding new SaleContainer`, 404);
        }

        return await this.prismaClient.saleContainer.create({
            data: {
                containerId: container.containerId,
                menuItemId: container.menuItemId,
                price: container.price
            }
        });
    }

    async getSaleContainer(id: string): Promise<SaleContainer | null> { 
        return await this.prismaClient.saleContainer.findUnique({
            where: {
                id: id
            }
        });
    }
    async getSaleContainersForMenuItem(itemId: string): Promise<Array<SaleContainer>> {
        return await this.prismaClient.saleContainer.findMany({
            where: {
                menuItemId: itemId
            }
        });
    }
    
    async removeSaleContainer(id: string): Promise<boolean> {
        const deleted = await this.prismaClient.saleContainer.delete({
            where: {
                id: id
            }
        });

        if (deleted) { 
            return true;
        }
        return false;
    }

    async validateItem(item: Item) {
        if (item.breweryId && !(await this.getBrewery(item.breweryId))) {
            throw new DataProviderError(`Brewery with ID ${item.breweryId} does not exist when modifying item`, 404);
        } 
    }

    async addItem(item: Item): Promise<Item> {
        await this.validateItem(item);

        return await this.prismaClient.item.create({
            data: {
                internalName: item.internalName!!,
                displayName: item.displayName!!,
                breweryId: item.breweryId,
                style: item.style,
                abv: item.abv,
                description: item.description,
                category: item.category,
            }
        });
    }

    async getItem(id: string): Promise<Item | null> { 
        return await this.prismaClient.item.findUnique({
            where: {
                id: id
            }
        });
    }
    
    async getItems(): Promise<Array<Item>> {
        return await this.prismaClient.item.findMany({});
    }

    async updateItem(itemId: string, item: Item): Promise<Item> {
        await this.validateItem(item);

        const original = await this.getItem(itemId);
        if (!original) {
            throw new DataProviderError(`Itemwith ID ${itemId} does not exist`, 404);
        }
        return await this.prismaClient.item.update({
            where: {
                id: itemId
            },
            data: {
                internalName: item.internalName? item.internalName : original.internalName!!,
                displayName: item.displayName? item.displayName : original.displayName!!,
                breweryId: item.breweryId? item.breweryId : original.breweryId,
                style: item.style? item.style : original.style,
                abv: item.abv? item.abv : original.abv,
                description: item.description? item.description : original.description,
                category: item.category? item.category : original.category,
            }
        })
    }

    // TODO: move the line
    addMenu(menu: Menu): Menu {
        return menu;
    }
    getMenu(id: string): Menu | null {
        return null;
    }
    getMenus(): Array<Menu> {
        return [];
    }
    updateMenu(id: string, menu: Menu): Menu {
        return menu;
    }
    
    addSubMenu(menu: SubMenu): SubMenu {
        return menu;
    }
    getSubMenu(id: string): SubMenu | null { 
        return null;
    }
    getSubMenusForMenu(menuId: string): Array<SubMenu> {
        return [];
    }
    updateSubMenu(id: string, subMenu: SubMenu): SubMenu {
        return subMenu;
    }
    
    addMenuItem(item: MenuItem): MenuItem {
        return item;
    }
    getMenuItem(id: string): MenuItem | null {
        return null;
    }
    getMenuItemsForMenu(menuId: string): Array<MenuItem> {
        return [];
    }
    getMenuItemsForSubMenu(subMenuId: string): Array<MenuItem> {
        return [];
    }
    removeMenuItem(id: string): boolean {
        return false;
    }
    updateMenuItem(id: string, item: MenuItem): MenuItem { 
        return item;
    }
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
    _cache: Map<string, Map<string, any>>;

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
            this.handleListJsonImport(filesInFolder, "menus.json", Menu.fromJsonEntry, this.addMenu.bind(this));
            this.handleListJsonImport(filesInFolder, "subMenus.json", SubMenu.fromJsonEntry, this.addSubMenu.bind(this));
            this.handleListJsonImport(filesInFolder, "menuItems.json", MenuItem.fromJsonEntry, this.addMenuItem.bind(this));
            this.handleListJsonImport(filesInFolder, "saleContainers.json", SaleContainer.fromJsonEntry, this.addSaleContainer.bind(this));
        }
    }

    getIdForAdd(map: Map<string, any>, existingId: string | null): number | string {
        if (existingId !== '' && existingId !== null){
            return existingId;
        }
        return uuidv4();
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

    getGeneric(id: any, mapName: string): any {
        const result = this._cache.get(mapName)!.get(id);
        if (!result) {
            return null;
        }

        return result;
    }

    getGenericList(mapName: string): any {
        // TODO: This needs to support pagination eventually
        const result = this._cache.get(mapName)!.values();
        if (!result) {
            return [];
        }

        return [...result];
    }

    validateUpdatedObject(updated: any, keysNotAllowed: string[]) {
        for(const key of keysNotAllowed) {
            if(updated[key] !== null) {
                throw new DataProviderError(`${key} is not allowed to be updated on ${updated.constructor.name}`, 400);
            }
        }
    }

    getObjectWithUpdatedFields(id: string, mapName: string, updated: any, constructorClass: any) {
        const originalValue = this.getGeneric(id, mapName);
        if (originalValue === null) {
            throw new DataProviderError(`${id} not found`, 404);
        }
        const objectProperties = Object.keys(originalValue);
        const newValues = [];
        for(const key of objectProperties) {
            const valueToAdd = updated[key] ? updated[key] : originalValue[key];
            newValues.push(valueToAdd);
        }
        const updatedValue = new constructorClass(...newValues);

        return updatedValue;
    }


    updateGeneric(id: string, mapName: string, updated: any, constructorClass: any, keysNotAllowed: string[]): any {
        this.validateUpdatedObject(updated, keysNotAllowed);
        const newValue = this.getObjectWithUpdatedFields(id, mapName, updated, constructorClass);
        
        const updateMap = this._cache.get(mapName)!;
        updateMap.set(id, newValue);
        
        return newValue;
    }

    idExists(id: string, mapName: string): boolean {
        const result = this.getGeneric(id, mapName);
        if (result !== null) {
            return true;
        }
        return false;
    }

    removeGeneric(id: string, mapName: string): boolean {
        if (!this.idExists(id, mapName)) {
            return false;
        } else {
            this._cache.get(mapName)!.delete(id);
            return true;
        }
    }

    async addBrewery(brewery: Brewery): Promise<Brewery> {
        return this.addGeneric(brewery, this.BREWERIES_KEY);
    }

    async getBrewery(id: string): Promise<Brewery | null> {
        return this.getGeneric(id, this.BREWERIES_KEY);
    }

    async getBreweries(): Promise<Array<Brewery>> {
        return this.getGenericList(this.BREWERIES_KEY);
    }

    async updateBrewery(breweryId: string, brewery: Brewery): Promise<Brewery> {
        return this.updateGeneric(breweryId, this.BREWERIES_KEY, brewery, Brewery, ['id']);
    }

    async addContainer(container: ItemContainer): Promise<ItemContainer> {
        return this.addGeneric(container, this.CONTAINERS_KEY);
    }

    async getContainer(id: string): Promise<ItemContainer | null> {
        return this.getGeneric(id, this.CONTAINERS_KEY);
    }

    async getContainers(): Promise<Array<ItemContainer>> {
        return this.getGenericList(this.CONTAINERS_KEY);
    }

    async updateContainer(containerId: string, container: ItemContainer): Promise<ItemContainer> {
        return this.updateGeneric(containerId, this.CONTAINERS_KEY, container, ItemContainer, ['id'])
    }

    async addSaleContainer(container: SaleContainer): Promise<SaleContainer> {
        // As with any "join" object, we need to validate the IDs being entered
        // TODO: would be much nicer with a relational DB
        if (!this.idExists(container.containerId, this.CONTAINERS_KEY)) {
            // TODO: Look up error handling best practices
            // A cursory skim suggests I'll need to refactor a lot of this code
            console.log(`TODO: Do an error here because ID ${container.containerId} does not exist for containers`)
        }
        if (!this.idExists(container.menuItemId, this.MENU_ITEMS_KEY)) {
            console.log(`TODO: Do an error here because ID ${container.menuItemId} does not exist for menu items`)
        }
        return this.addGeneric(container, this.SALE_CONTAINERS_KEY);
    }

    async getSaleContainer(id: string): Promise<SaleContainer | null> {
        return this.getGeneric(id, this.SALE_CONTAINERS_KEY);
    }

    async getSaleContainersForMenuItem(menuItemId: string): Promise<Array<SaleContainer>> {
        const saleContainers = this._cache.get(this.SALE_CONTAINERS_KEY)!;
        const results: Array<SaleContainer> = [];
        saleContainers.forEach((value: SaleContainer) => {
            if (value.menuItemId === menuItemId) {
                results.push(value);
            }
        });

        return results;
    }

    async removeSaleContainer(id: string): Promise<boolean> {
        return this.removeGeneric(id, this.SALE_CONTAINERS_KEY);
    }

    validateItem(item: Item) {
        if (item.breweryId && !this.idExists(item.breweryId, this.BREWERIES_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.breweryId} does not exist for breweries when adding ${item.id}`)
        }
    }

    async addItem(item: Item): Promise<Item> {
        this.validateItem(item);
        return this.addGeneric(item, this.ITEMS_KEY);
    }

    async getItem(id: string): Promise<Item | null> {
        return this.getGeneric(id, this.ITEMS_KEY);
    }

    async getItems(): Promise<Array<Item>> {
        return this.getGenericList(this.ITEMS_KEY);
    }

    async updateItem(itemId: string, item: Item): Promise<Item> {
        this.validateItem(item);
        return this.updateGeneric(itemId, this.ITEMS_KEY, item, Item, ['id']);
    }

    addMenu(menu: Menu): Menu {
        return this.addGeneric(menu, this.MENUS_KEY);
    }

    getMenu(id: string): Menu | null {
        return this.getGeneric(id, this.MENUS_KEY);
    }

    getMenus(): Array<Menu> {
        return this.getGenericList(this.MENUS_KEY);
    }

    updateMenu(id: string, menu: Menu): Menu {
        return this.updateGeneric(id, this.MENUS_KEY, menu, Menu, ['id']);
    }

    validateSubMenu(item: SubMenu) {
        if (item.menuId && !this.idExists(item.menuId, this.MENUS_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.menuId} does not exist for menus when adding ${item.id}`)
        }
    }

    addSubMenu(subMenu: SubMenu): SubMenu {
        this.validateSubMenu(subMenu);
        return this.addGeneric(subMenu, this.SUBMENUS_KEY);
    }

    getSubMenu(id: string): SubMenu | null {
        return this.getGeneric(id, this.SUBMENUS_KEY);
    }

    getSubMenusForMenu(menuId: string): Array<SubMenu> {
        const subMenus = this._cache.get(this.SUBMENUS_KEY)!;
        const results: Array<SubMenu> = [];
        subMenus.forEach((value: SubMenu) => {
            if (value.menuId === menuId) {
                results.push(value);
            }
        });

        results.sort((a: SubMenu, b: SubMenu) => (a.order ? a.order : 999) - (b.order ? b.order : 999));
        return results;
    }

    updateSubMenu(id: string, subMenu: SubMenu): SubMenu {
        this.validateSubMenu(subMenu);
        return this.updateGeneric(id, this.SUBMENUS_KEY, subMenu, SubMenu, ['id']);
    }

    validateMenuItem(item: MenuItem) {
        if (item.menuId && !this.idExists(item.menuId, this.MENUS_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.menuId} does not exist for menus`);
        }
        if (item.itemId && !this.idExists(item.itemId, this.ITEMS_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.itemId} does not exist for items`);
        }
        if (item.subMenuId && !this.idExists(item.subMenuId, this.SUBMENUS_KEY)) {
            console.log(`TODO: Do an error here because ID ${item.subMenuId} does not exist for submenus`);
        }
    }

    addMenuItem(item: MenuItem): MenuItem {
        this.validateMenuItem(item);
        return this.addGeneric(item, this.MENU_ITEMS_KEY);
    }

    getMenuItem(id: string): MenuItem | null {
        return this.getGeneric(id, this.MENU_ITEMS_KEY);
    }

    getMenuItemsForMenu(menuId: string): Array<MenuItem> {
        const itemMap = this._cache.get(this.MENU_ITEMS_KEY)!;
        const results: Array<MenuItem> = [];
        itemMap.forEach((value: MenuItem) => {
            if (value.menuId === menuId) {
                results.push(value);
            }
        });

        return results;
    }

    getMenuItemsForSubMenu(subMenuId: string): Array<MenuItem> {
        const itemMap = this._cache.get(this.MENU_ITEMS_KEY)!;
        
        const results: Array<MenuItem> = [];
        itemMap.forEach((value: MenuItem) => {
            if (value.subMenuId === subMenuId) {
                results.push(value);
            }
        });

        return results; 
    }

    removeMenuItem(id: string): boolean {
        return this.removeGeneric(id, this.MENU_ITEMS_KEY);
    }

    updateMenuItem(id: string, item: MenuItem): MenuItem {
        this.validateMenuItem(item);
        return this.updateGeneric(id, this.MENU_ITEMS_KEY, item, MenuItem, ["id"]);
    }
}
