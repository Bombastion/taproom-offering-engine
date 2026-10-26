import fs from 'fs';
import { ItemContainer, SaleContainer } from '../models/containers';
import { Item } from "../models/items";
import { Brewery } from '../models/breweries';
import { Menu, MenuItem, SubMenu } from '../models/menus';
import { NewUser, normalizeEmail, Session, User, UserUpdate } from '../models/users';
import {v4 as uuidv4} from 'uuid';
import { PrismaClient } from '../generated/prisma/client';

export class DataProviderError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message); 
        this.statusCode = statusCode;
    }
}

function containerInUse(count: number): DataProviderError {
    return new DataProviderError(`This pour size is still used by ${count} ${count === 1 ? 'price' : 'prices'}. Remove it from those items first.`, 409);
}

function itemInUse(count: number): DataProviderError {
    return new DataProviderError(`This item is still on ${count} menu ${count === 1 ? 'section' : 'sections'}. Take it off first.`, 409);
}

export abstract class DataProvider {
    /*
    Everything a user owns (breweries, pour sizes, prices, items, menus, sections and menu items)
    is stamped with that user's ID, and nobody else can see or change it.

    A provider made directly (new PrismaDataProvider(...)) is the *unscoped* one: it can read
    anything, which is what the public menu views need since they look a menu up by its ID alone
    and have no signed-in user. It can't create owned data, though, because it doesn't know whose
    it would be. Everything that acts for a signed-in user goes through forOwner() instead:

    The provider it returns has the same methods, but only ever sees that user's data (another
    user's IDs come back as "not found", and lists leave theirs out), creates data owned by that
    user, and refuses to link to things the user doesn't own (an item at someone else's brewery, a
    price in someone else's pour size). Users and sessions aren't owned data, and work the same on
    both.
    */
    abstract forOwner(ownerId: string): DataProvider;

    abstract addBrewery(brewery: Brewery): Promise<Brewery>;
    abstract getBrewery(id: string): Promise<Brewery | null>;
    abstract getBreweries(): Promise<Array<Brewery>>;
    // Sets every field exactly as given, so the location or logo can be cleared
    abstract replaceBrewery(breweryId: string, brewery: Brewery): Promise<Brewery>;

    abstract addContainer(container: ItemContainer): Promise<ItemContainer>;
    abstract getContainer(id: string): Promise<ItemContainer | null>;
    abstract getContainers(): Promise<Array<ItemContainer>>;
    abstract updateContainer(containerId: string, container: ItemContainer): Promise<ItemContainer>;
    // Deletes a container (pour size). Returns true if it was removed, and false if it didn't
    // exist. Refuses with a 409 while any price (sale container) still uses it; prices left
    // behind by an already-deleted menu item don't count, and are removed along with it.
    abstract removeContainer(id: string): Promise<boolean>;

    abstract addSaleContainer(container: SaleContainer): Promise<SaleContainer>;
    abstract getSaleContainersForMenuItem(itemId: string): Promise<Array<SaleContainer>>;
    // Every price using a given container (pour size) on a menu item that still exists. (Some
    // since-removed routes deleted menu items without their prices; those leftovers are skipped.)
    abstract getSaleContainersForContainer(containerId: string): Promise<Array<SaleContainer>>;
    // Deletes a sale container. Returns true if the item was removed, and false if it didn't exist.
    abstract removeSaleContainer(id: string): Promise<boolean>;

    abstract addItem(item: Item): Promise<Item>;
    abstract getItem(id: string): Promise<Item | null>;
    abstract getItems(): Promise<Array<Item>>;
    // Replaces every field except the ID with exactly what's given, so fields can be cleared and
    // set to falsy values like an ABV of 0.
    abstract replaceItem(itemId: string, item: Item): Promise<Item>;
    // Deletes an item from the library. Returns true if it was removed, and false if it didn't
    // exist. Refuses with a 409 while the item is still placed on any menu.
    abstract removeItem(id: string): Promise<boolean>;

    abstract addMenu(menu: Menu): Promise<Menu>;
    abstract getMenu(id: string): Promise<Menu | null>;
    abstract getMenus(): Promise<Array<Menu>>;
    abstract updateMenu(id: string, menu: Menu): Promise<Menu>;
    // Like updateMenu, but sets every field exactly as given (so the logo or default brewery can be
    // removed), which also means callers have to pass along the fields they aren't changing
    abstract replaceMenu(id: string, menu: Menu): Promise<Menu>;
    
    abstract addSubMenu(menu: SubMenu): Promise<SubMenu>;
    abstract getSubMenu(id: string): Promise<SubMenu | null>;
    // Gets all sub-menus for a menu, ordered by "order"
    abstract getSubMenusForMenu(menuId: string): Promise<Array<SubMenu>>;
    abstract updateSubMenu(id: string, subMenu: SubMenu): Promise<SubMenu>;
    // Deletes a sub-menu along with its menu items and their sale containers.
    // Returns true if the sub-menu was removed, and false if it didn't exist.
    abstract removeSubMenu(id: string): Promise<boolean>;
    
    abstract addMenuItem(item: MenuItem): Promise<MenuItem>
    abstract getMenuItem(id: string): Promise<MenuItem | null>
    abstract getMenuItemsForMenu(menuId: string): Promise<Array<MenuItem>>
    abstract getMenuItemsForSubMenu(subMenuId: string): Promise<Array<MenuItem>>
    // Every placement of a given item across all menus, oldest first
    abstract getMenuItemsForItem(itemId: string): Promise<Array<MenuItem>>
    // Deletes a menu item. Returns true if it was removed, and false if it didn't exist.
    abstract removeMenuItem(id: string): Promise<boolean>
    // Leaves `active` alone; use setMenuItemActive for that
    abstract updateMenuItem(id: string, item: MenuItem): Promise<MenuItem>
    // Marks a menu item active or inactive, leaving everything else (order, prices) as it was
    abstract setMenuItemActive(id: string, active: boolean): Promise<MenuItem>
    // Sets (or, with null, clears) a menu item's own logo, which updateMenuItem can't do
    abstract setMenuItemLogo(id: string, itemLogo: string | null): Promise<MenuItem>

    // ---- Users and sessions ----

    // Creates a user, lowercasing the email. Refuses with a 409 if that email is taken.
    abstract createUser(user: NewUser): Promise<User>;
    abstract getUser(id: string): Promise<User | null>;
    // Case-insensitive
    abstract getUserByEmail(email: string): Promise<User | null>;
    abstract countUsers(): Promise<number>;
    // Everyone, oldest account first
    abstract getUsers(): Promise<Array<User>>;
    // Changes the given fields of a user, lowercasing a new email. Refuses with a 404 if there is
    // no such user, and a 409 if the new email is taken.
    abstract updateUser(id: string, fields: UserUpdate): Promise<User>;

    abstract createSession(session: Session): Promise<Session>;
    abstract getSession(id: string): Promise<Session | null>;
    // Does nothing if the session is already gone
    abstract deleteSession(id: string): Promise<void>;
    // Signs a user out everywhere, except (optionally) the session making the request
    abstract deleteSessionsForUser(userId: string, exceptSessionId?: string): Promise<void>;
    // Clears out sessions that have run out. Returns how many were removed.
    abstract deleteExpiredSessions(now: Date): Promise<number>;
}

export class PrismaDataProvider extends DataProvider {
    prismaClient: PrismaClient
    // The user whose data this provider is limited to, or null for the unscoped provider (see
    // DataProvider.forOwner)
    ownerId: string | null

    constructor(prisma: PrismaClient, ownerId: string | null = null) {
        super();
        this.prismaClient = prisma;
        this.ownerId = ownerId;
    }

    forOwner(ownerId: string): DataProvider {
        if (this.ownerId !== null) {
            if (this.ownerId === ownerId) {
                return this;
            }
            // Widening or switching a user's view must never be possible from inside the app
            throw new Error('This provider is already limited to a user');
        }
        return new PrismaDataProvider(this.prismaClient, ownerId);
    }

    // Added to the `where` of every query on owned data: nothing for the unscoped provider
    private owned(): { ownerId?: string } {
        return this.ownerId === null ? {} : { ownerId: this.ownerId };
    }

    // The owner to put on anything created
    private owner(): string {
        if (this.ownerId === null) {
            throw new Error('Data can only be created through forOwner(userId), so it has an owner');
        }
        return this.ownerId;
    }

    async addBrewery(brewery: Brewery): Promise<Brewery> {
        return await this.prismaClient.brewery.create({
            data: {
                ownerId: this.owner(),
                name: brewery.name!!,
                defaultLogo: brewery.defaultLogo,
                location: brewery.location
            }
        })
    }

    async getBrewery(id: string): Promise<Brewery | null> {
        return await this.prismaClient.brewery.findFirst({ where: { id: id, ...this.owned() } });
    }

    async getBreweries(): Promise<Array<Brewery>> {
        return await this.prismaClient.brewery.findMany({ where: this.owned() });
    }

    async replaceBrewery(breweryId: string, brewery: Brewery): Promise<Brewery> {
        const original = await this.getBrewery(breweryId);
        if (!original) {
            throw new DataProviderError(`Brewery with ID ${breweryId} does not exist`, 404);
        }
        if (!brewery.name) {
            throw new DataProviderError(`Breweries require a name`, 422);
        }
        return await this.prismaClient.brewery.update({
            where: {
                id: breweryId, ...this.owned()
            },
            data: {
                name: brewery.name,
                location: brewery.location,
                defaultLogo: brewery.defaultLogo,
            }
        });
    }

    async addContainer(container: ItemContainer): Promise<ItemContainer> {
        return await this.prismaClient.itemContainer.create({
            data: {
                ownerId: this.owner(),
                containerName: container.containerName!!,
                displayName: container.displayName!!,
                order: container.order
            }
        })
    }

    async getContainer(id: string): Promise<ItemContainer | null> {
        return await this.prismaClient.itemContainer.findFirst({ where: { id: id, ...this.owned() } })
    }

    async getContainers(): Promise<Array<ItemContainer>> {
        return await this.prismaClient.itemContainer.findMany({ where: this.owned() });
    }

    async updateContainer(containerId: string, container: ItemContainer): Promise<ItemContainer> {
        const original = await this.getContainer(containerId);
        if (!original) {
            throw new DataProviderError(`ItemContainer with ID ${containerId} does not exist`, 404);
        }
        const updateResult = await this.prismaClient.itemContainer.update({
            where: {
                id: containerId, ...this.owned()
            },
            data: {
                containerName: container.containerName? container.containerName : original.containerName!!,
                displayName: container.displayName? container.displayName : original.displayName!!,
                order: container.order? container.order : original.order
            }
        });

        return updateResult;
    }

    async removeContainer(id: string): Promise<boolean> {
        // Check and delete in one transaction, so a price added in between can't be orphaned
        return await this.prismaClient.$transaction(async (tx) => {
            const prices = await tx.saleContainer.findMany({ where: { containerId: id, ...this.owned() } });
            const menuItems = await tx.menuItem.findMany({ where: { id: { in: prices.map((p) => p.menuItemId) }, ...this.owned() } });
            const liveIds = new Set(menuItems.map((m) => m.id));
            const uses = prices.filter((p) => liveIds.has(p.menuItemId)).length;
            if (uses > 0) {
                throw containerInUse(uses);
            }
            // Only leftovers from deleted menu items remain at this point
            await tx.saleContainer.deleteMany({ where: { containerId: id, ...this.owned() } });
            const { count } = await tx.itemContainer.deleteMany({ where: { id: id, ...this.owned() } });
            return count > 0;
        });
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
                ownerId: this.owner(),
                containerId: container.containerId,
                menuItemId: container.menuItemId,
                price: container.price
            }
        });
    }

    async getSaleContainersForMenuItem(itemId: string): Promise<Array<SaleContainer>> {
        return await this.prismaClient.saleContainer.findMany({
            where: {
                menuItemId: itemId,
                ...this.owned(),
            }
        });
    }

    async getSaleContainersForContainer(containerId: string): Promise<Array<SaleContainer>> {
        const prices = await this.prismaClient.saleContainer.findMany({
            where: {
                containerId: containerId,
                ...this.owned(),
            }
        });
        const menuItems = await this.prismaClient.menuItem.findMany({
            where: {
                id: { in: prices.map((p) => p.menuItemId) },
                ...this.owned(),
            }
        });
        const liveIds = new Set(menuItems.map((m) => m.id));
        return prices.filter((p) => liveIds.has(p.menuItemId));
    }
    
    async removeSaleContainer(id: string): Promise<boolean> {
        // deleteMany rather than delete: delete throws when the ID doesn't exist, but callers
        // expect false for that (see DataProvider.removeSaleContainer)
        const { count } = await this.prismaClient.saleContainer.deleteMany({
            where: {
                id: id, ...this.owned()
            }
        });
        return count > 0;
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
                ownerId: this.owner(),
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
        return await this.prismaClient.item.findFirst({ where: { id: id, ...this.owned() } });
    }
    
    async getItems(): Promise<Array<Item>> {
        return await this.prismaClient.item.findMany({
            where: this.owned(),
            orderBy: [
                {
                    displayName: 'asc'
                }
            ]
        });
    }

    async replaceItem(itemId: string, item: Item): Promise<Item> {
        await this.validateItem(item);

        const original = await this.getItem(itemId);
        if (!original) {
            throw new DataProviderError(`Item with ID ${itemId} does not exist`, 404);
        }
        if (!item.internalName || !item.displayName) {
            throw new DataProviderError(`Items require both an internal name and a display name`, 422);
        }
        return await this.prismaClient.item.update({
            where: {
                id: itemId, ...this.owned()
            },
            data: {
                internalName: item.internalName,
                displayName: item.displayName,
                breweryId: item.breweryId,
                style: item.style,
                abv: item.abv,
                description: item.description,
                category: item.category,
            }
        });
    }

    async removeItem(id: string): Promise<boolean> {
        return await this.prismaClient.$transaction(async (tx) => {
            const placements = await tx.menuItem.count({ where: { itemId: id, ...this.owned() } });
            if (placements > 0) {
                throw itemInUse(placements);
            }
            const { count } = await tx.item.deleteMany({ where: { id: id, ...this.owned() } });
            return count > 0;
        });
    }

    async validateMenu(menu: Menu) {
        if (menu.defaultBreweryId && !(await this.getBrewery(menu.defaultBreweryId))) {
            throw new DataProviderError(`Brewery with ID ${menu.defaultBreweryId} does not exist when modifying menu`, 404);
        }
    }

    async addMenu(menu: Menu): Promise<Menu> {
        await this.validateMenu(menu);
        return await this.prismaClient.menu.create({
            data: {
                ownerId: this.owner(),
                internalName: menu.internalName!!,
                displayName: menu.displayName!!,
                logo: menu.logo,
                defaultBreweryId: menu.defaultBreweryId,
            }
        });
    }

    async getMenu(id: string): Promise<Menu | null> {
        return await this.prismaClient.menu.findFirst({ where: { id: id, ...this.owned() } });
    }

    async getMenus(): Promise<Array<Menu>> {
        return await this.prismaClient.menu.findMany({ where: this.owned() });
    }

    async updateMenu(id: string, menu: Menu): Promise<Menu> {
        await this.validateMenu(menu);
        const original = await this.getMenu(id);
        if (!original) {
            throw new DataProviderError(`Menu with ID ${id} does not exist`, 404);
        }
        return await this.prismaClient.menu.update({
            where: {
                id: id, ...this.owned()
            },
            data: {
                internalName: menu.internalName? menu.internalName : original.internalName!!,
                displayName: menu.displayName? menu.displayName : original.displayName!!,
                logo: menu.logo? menu.logo : original.logo,
                defaultBreweryId: menu.defaultBreweryId? menu.defaultBreweryId : original.defaultBreweryId,
            }
        });
    }
    
    async replaceMenu(id: string, menu: Menu): Promise<Menu> {
        const original = await this.getMenu(id);
        if (!original) {
            throw new DataProviderError(`Menu with ID ${id} does not exist`, 404);
        }
        if (!menu.internalName || !menu.displayName) {
            throw new DataProviderError(`Menus require both an internal name and a display name`, 422);
        }
        await this.validateMenu(menu);
        return await this.prismaClient.menu.update({
            where: {
                id: id, ...this.owned()
            },
            data: {
                internalName: menu.internalName,
                displayName: menu.displayName,
                logo: menu.logo,
                defaultBreweryId: menu.defaultBreweryId,
            }
        });
    }

    async validateSubMenu(menu: SubMenu) {
        if (menu.menuId && !(await this.getMenu(menu.menuId))) {
            throw new DataProviderError(`Menu with ID ${menu.menuId} does not exist when modifying sub menu`, 404);
        }
    }

    async addSubMenu(menu: SubMenu): Promise<SubMenu> {
        await this.validateSubMenu(menu)

        return await this.prismaClient.subMenu.create({
            data: {
                ownerId: this.owner(),
                internalName: menu.internalName!!,
                displayName: menu.displayName!!,
                menuId: menu.menuId!!,
                order: menu.order,
                hiddenOn: menu.hiddenOn ?? [],
            }
        })
    }

    async getSubMenu(id: string): Promise<SubMenu | null> { 
        return await this.prismaClient.subMenu.findFirst({ where: { id: id, ...this.owned() } });
    }

    async getSubMenusForMenu(menuId: string): Promise<Array<SubMenu>> {
        return await this.prismaClient.subMenu.findMany({
            where: {
                menuId: menuId,
                ...this.owned(),
            }
        });
    }

    async updateSubMenu(id: string, subMenu: SubMenu): Promise<SubMenu> {
        await this.validateSubMenu(subMenu);

        const original = await this.getSubMenu(id);
        if (!original) {
            throw new DataProviderError(`SubMenu with ID ${id} does not exist`, 404);
        }
        return await this.prismaClient.subMenu.update({
            where: {
                id: id, ...this.owned()
            },
            data: {
                internalName: subMenu.internalName? subMenu.internalName : original.internalName!!,
                displayName: subMenu.displayName? subMenu.displayName : original.displayName!!,
                menuId: subMenu.menuId? subMenu.menuId : original.menuId!!,
                order: subMenu.order? subMenu.order : original.order,
                hiddenOn: subMenu.hiddenOn? subMenu.hiddenOn : original.hiddenOn,
            }
        });
    }
    
    async removeSubMenu(id: string): Promise<boolean> {
        const original = await this.getSubMenu(id);
        if (!original) {
            return false;
        }
        await this.prismaClient.$transaction(async (tx) => {
            const menuItems = await tx.menuItem.findMany({ where: { subMenuId: id, ...this.owned() } });
            const menuItemIds = menuItems.map((menuItem) => menuItem.id);
            await tx.saleContainer.deleteMany({ where: { menuItemId: { in: menuItemIds }, ...this.owned() } });
            await tx.menuItem.deleteMany({ where: { subMenuId: id, ...this.owned() } });
            await tx.subMenu.delete({ where: { id: id, ...this.owned() } });
        });
        return true;
    }

    async validateMenuItem(item: MenuItem) {
        if (item.menuId && !(await this.getMenu(item.menuId))) {
            throw new DataProviderError(`Menu with ID ${item.menuId} does not exist when modifying menu item`, 404);
        }
        if (item.itemId && !(await this.getItem(item.itemId))) {
            throw new DataProviderError(`Item with ID ${item.itemId} does not exist when modifying menu item`, 404);
        }
        if (item.subMenuId && !(await this.getSubMenu(item.subMenuId))) {
            throw new DataProviderError(`Sub Menu with ID ${item.subMenuId} does not exist when modifying menu item`, 404);
        }
    }

    async addMenuItem(item: MenuItem): Promise<MenuItem> {
        await this.validateMenuItem(item);

        return await this.prismaClient.menuItem.create({
            data: {
                ownerId: this.owner(),
                menuId: item.menuId!!,
                itemId: item.itemId!!,
                subMenuId: item.subMenuId!!,
                itemLogo: item.itemLogo,
                order: item.order,
                active: item.active ?? true,
            }
        })
    }

    async getMenuItem(id: string): Promise<MenuItem | null> {
        return await this.prismaClient.menuItem.findFirst({ where: { id: id, ...this.owned() } });
    }

    async getMenuItemsForMenu(menuId: string): Promise<Array<MenuItem>> {
        return await this.prismaClient.menuItem.findMany({
            where: {
                menuId: menuId,
                ...this.owned(),
            }
        });
    }

    async getMenuItemsForSubMenu(subMenuId: string): Promise<Array<MenuItem>> {
        return await this.prismaClient.menuItem.findMany({
            where: {
                subMenuId: subMenuId,
                ...this.owned(),
            }
        });
    }

    async getMenuItemsForItem(itemId: string): Promise<Array<MenuItem>> {
        return await this.prismaClient.menuItem.findMany({
            where: {
                itemId: itemId,
                ...this.owned(),
            },
            // Oldest placement first. Placements that existed before createdAt was added all
            // share the migration's timestamp, so the ID breaks ties to keep the order stable.
            orderBy: [
                { createdAt: 'asc' },
                { id: 'asc' },
            ]
        });
    }

    async removeMenuItem(id: string): Promise<boolean> {
        // deleteMany rather than delete: delete throws when the ID doesn't exist, but callers
        // expect false for that (see DataProvider.removeMenuItem)
        const { count } = await this.prismaClient.menuItem.deleteMany({
            where: {
                id: id, ...this.owned()
            }
        });
        return count > 0;
    }

    async updateMenuItem(id: string, item: MenuItem): Promise<MenuItem> { 
        await this.validateMenuItem(item);

        const original = await this.getMenuItem(id);
        if (!original) {
            throw new DataProviderError(`Menu Item with ID ${id} does not exist`, 404);
        }
        return await this.prismaClient.menuItem.update({
            where: {
                id: id, ...this.owned()
            },
            data: {
                menuId: item.menuId? item.menuId : original.menuId!!,
                itemId: item.itemId? item.itemId : original.itemId!!,
                subMenuId: item.subMenuId? item.subMenuId : original.subMenuId!!,
                itemLogo: item.itemLogo? item.itemLogo : original.itemLogo,
                order: item.order? item.order : original.order,
            }
        });
    }

    async setMenuItemActive(id: string, active: boolean): Promise<MenuItem> {
        const original = await this.getMenuItem(id);
        if (!original) {
            throw new DataProviderError(`Menu Item with ID ${id} does not exist`, 404);
        }
        return await this.prismaClient.menuItem.update({
            where: {
                id: id, ...this.owned()
            },
            data: {
                active: active,
            }
        });
    }

    async setMenuItemLogo(id: string, itemLogo: string | null): Promise<MenuItem> {
        const original = await this.getMenuItem(id);
        if (!original) {
            throw new DataProviderError(`Menu Item with ID ${id} does not exist`, 404);
        }
        return await this.prismaClient.menuItem.update({
            where: {
                id: id, ...this.owned()
            },
            data: {
                itemLogo: itemLogo,
            }
        });
    }

    async createUser(user: NewUser): Promise<User> {
        try {
            return await this.prismaClient.user.create({
                data: {
                    email: normalizeEmail(user.email),
                    displayName: user.displayName ?? null,
                    passwordHash: user.passwordHash ?? null,
                    role: user.role ?? 'USER',
                    status: user.status ?? 'PENDING',
                }
            });
        } catch (e: any) {
            // Prisma's unique constraint violation
            if (e?.code === 'P2002') {
                throw new DataProviderError('An account with that email already exists', 409);
            }
            throw e;
        }
    }

    async getUser(id: string): Promise<User | null> {
        return await this.prismaClient.user.findUnique({ where: { id: id } });
    }

    async getUsers(): Promise<Array<User>> {
        return await this.prismaClient.user.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    }

    async updateUser(id: string, fields: UserUpdate): Promise<User> {
        const data = { ...fields };
        if (data.email !== undefined) {
            data.email = normalizeEmail(data.email);
        }
        try {
            return await this.prismaClient.user.update({ where: { id: id }, data: data });
        } catch (e: any) {
            // Prisma's unique constraint violation, and its "record to update not found"
            if (e?.code === 'P2002') {
                throw new DataProviderError('An account with that email already exists', 409);
            }
            if (e?.code === 'P2025') {
                throw new DataProviderError(`User with ID ${id} does not exist`, 404);
            }
            throw e;
        }
    }

    async getUserByEmail(email: string): Promise<User | null> {
        return await this.prismaClient.user.findUnique({ where: { email: normalizeEmail(email) } });
    }

    async countUsers(): Promise<number> {
        return await this.prismaClient.user.count();
    }

    async createSession(session: Session): Promise<Session> {
        return await this.prismaClient.session.create({
            data: {
                id: session.id,
                userId: session.userId,
                expiresAt: session.expiresAt,
            }
        });
    }

    async getSession(id: string): Promise<Session | null> {
        return await this.prismaClient.session.findUnique({ where: { id: id } });
    }

    async deleteSession(id: string): Promise<void> {
        await this.prismaClient.session.deleteMany({ where: { id: id } });
    }
    async deleteSessionsForUser(userId: string, exceptSessionId?: string): Promise<void> {
        await this.prismaClient.session.deleteMany({
            where: { userId: userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
        });
    }

    async deleteExpiredSessions(now: Date): Promise<number> {
        const result = await this.prismaClient.session.deleteMany({ where: { expiresAt: { lt: now } } });
        return result.count;
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
    USERS_KEY = "users";
    SESSIONS_KEY = "sessions";

    dataFolder: string;
    _cache: Map<string, Map<string, any>>;
    // Who owns each entry, per table: id -> owner ID (null for entries made without an owner,
    // like the sample data, which only the unscoped provider can see)
    _owners: Map<string, Map<string, string | null>>;
    // The user this provider is limited to, or null for the unscoped one (see DataProvider.forOwner)
    ownerId: string | null;

    // `shared` is how forOwner() makes a scoped view onto the same data
    constructor(dataFolder: string, shared?: { cache: Map<string, Map<string, any>>; owners: Map<string, Map<string, string | null>> }, ownerId: string | null = null) {
        super();
        this.dataFolder = dataFolder;
        this.ownerId = ownerId;
        if (shared) {
            this._cache = shared.cache;
            this._owners = shared.owners;
            return;
        }
        this._owners = new Map;
        this._cache = new Map;
        this._cache.set(this.BREWERIES_KEY, new Map);
        this._cache.set(this.CONTAINERS_KEY, new Map);
        this._cache.set(this.SALE_CONTAINERS_KEY, new Map);
        this._cache.set(this.ITEMS_KEY, new Map);
        this._cache.set(this.MENU_ITEMS_KEY, new Map);
        this._cache.set(this.MENUS_KEY, new Map);
        this._cache.set(this.SUBMENUS_KEY, new Map);
        this._cache.set(this.USERS_KEY, new Map);
        this._cache.set(this.SESSIONS_KEY, new Map);
        for (const key of this._cache.keys()) {
            this._owners.set(key, new Map);
        }
        this.loadFromFile();
    }

    forOwner(ownerId: string): DataProvider {
        if (this.ownerId !== null) {
            if (this.ownerId === ownerId) {
                return this;
            }
            throw new Error('This provider is already limited to a user');
        }
        return new LocalDataProvider(this.dataFolder, { cache: this._cache, owners: this._owners }, ownerId);
    }

    // Whether this provider may see the entry: the unscoped one sees everything
    isVisible(id: string, mapName: string): boolean {
        return this.ownerId === null || this._owners.get(mapName)!.get(id) === this.ownerId;
    }

    // The entries of a table that this provider may see
    visibleValues(mapName: string): any[] {
        const owners = this._owners.get(mapName)!;
        return [...this._cache.get(mapName)!.values()].filter((value) => this.ownerId === null || owners.get(value.id) === this.ownerId);
    }

    // The unscoped provider shrugs at a link to something that isn't there (the old behavior,
    // which the sample data and some tests lean on). A scoped one refuses, like the Prisma
    // provider does: that is also what stops a user linking to somebody else's data, which looks
    // exactly like data that doesn't exist.
    missingReference(kind: string, id: string, todo: string): void {
        if (this.ownerId !== null) {
            throw new DataProviderError(`${kind} with ID ${id} does not exist`, 404);
        }
        console.log(todo);
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
        this._owners.get(mapName)!.set(toAdd.id, this.ownerId);

        return toAdd;
    }

    getGeneric(id: any, mapName: string): any {
        const result = this._cache.get(mapName)!.get(id);
        if (!result || !this.isVisible(id, mapName)) {
            return null;
        }

        return result;
    }

    getGenericList(mapName: string): any {
        // TODO: This needs to support pagination eventually
        return this.visibleValues(mapName);
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
            this._owners.get(mapName)!.delete(id);
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

    async replaceBrewery(breweryId: string, brewery: Brewery): Promise<Brewery> {
        if (!this.idExists(breweryId, this.BREWERIES_KEY)) {
            throw new DataProviderError(`${breweryId} not found`, 404);
        }
        const replacement = new Brewery(breweryId, brewery.name, brewery.defaultLogo, brewery.location);
        this._cache.get(this.BREWERIES_KEY)!.set(breweryId, replacement);
        return replacement;
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

    async removeContainer(id: string): Promise<boolean> {
        const uses = await this.getSaleContainersForContainer(id);
        if (uses.length > 0) {
            throw containerInUse(uses.length);
        }
        // Only leftovers from deleted menu items remain at this point
        this.visibleValues(this.SALE_CONTAINERS_KEY).forEach((value: SaleContainer) => {
            if (value.containerId === id) {
                this.removeGeneric(value.id!, this.SALE_CONTAINERS_KEY);
            }
        });
        return this.removeGeneric(id, this.CONTAINERS_KEY);
    }

    async addSaleContainer(container: SaleContainer): Promise<SaleContainer> {
        // As with any "join" object, we need to validate the IDs being entered
        // TODO: would be much nicer with a relational DB
        if (!this.idExists(container.containerId, this.CONTAINERS_KEY)) {
            // TODO: Look up error handling best practices
            // A cursory skim suggests I'll need to refactor a lot of this code
            this.missingReference('Container', container.containerId, `TODO: Do an error here because ID ${container.containerId} does not exist for containers`);
        }
        if (!this.idExists(container.menuItemId, this.MENU_ITEMS_KEY)) {
            this.missingReference('Menu item', container.menuItemId, `TODO: Do an error here because ID ${container.menuItemId} does not exist for menu items`);
        }
        return this.addGeneric(container, this.SALE_CONTAINERS_KEY);
    }

    async getSaleContainersForMenuItem(menuItemId: string): Promise<Array<SaleContainer>> {
        const saleContainers = this.visibleValues(this.SALE_CONTAINERS_KEY);
        const results: Array<SaleContainer> = [];
        saleContainers.forEach((value: SaleContainer) => {
            if (value.menuItemId === menuItemId) {
                results.push(value);
            }
        });

        return results;
    }

    async getSaleContainersForContainer(containerId: string): Promise<Array<SaleContainer>> {
        const results: Array<SaleContainer> = [];
        this.visibleValues(this.SALE_CONTAINERS_KEY).forEach((value: SaleContainer) => {
            if (value.containerId === containerId && this.idExists(value.menuItemId, this.MENU_ITEMS_KEY)) {
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
            this.missingReference('Brewery', item.breweryId, `TODO: Do an error here because ID ${item.breweryId} does not exist for breweries when adding ${item.id}`);
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

    async replaceItem(itemId: string, item: Item): Promise<Item> {
        this.validateItem(item);
        if (!this.idExists(itemId, this.ITEMS_KEY)) {
            throw new DataProviderError(`${itemId} not found`, 404);
        }
        const replacement = new Item(itemId, item.internalName, item.displayName, item.breweryId, item.style, item.abv, item.description, item.category);
        this._cache.get(this.ITEMS_KEY)!.set(itemId, replacement);
        return replacement;
    }

    async removeItem(id: string): Promise<boolean> {
        const placements = await this.getMenuItemsForItem(id);
        if (placements.length > 0) {
            throw itemInUse(placements.length);
        }
        return this.removeGeneric(id, this.ITEMS_KEY);
    }

    validateMenu(menu: Menu) {
        if (menu.defaultBreweryId && !this.idExists(menu.defaultBreweryId, this.BREWERIES_KEY)) {
            this.missingReference('Brewery', menu.defaultBreweryId, `TODO: Do an error here because ID ${menu.defaultBreweryId} does not exist for breweries when modifying menu ${menu.id}`);
        }
    }

    async addMenu(menu: Menu): Promise<Menu> {
        this.validateMenu(menu);
        return this.addGeneric(menu, this.MENUS_KEY);
    }

    async getMenu(id: string): Promise<Menu | null> {
        return this.getGeneric(id, this.MENUS_KEY);
    }

    async getMenus(): Promise<Array<Menu>> {
        return this.getGenericList(this.MENUS_KEY);
    }

    async updateMenu(id: string, menu: Menu): Promise<Menu> {
        this.validateMenu(menu);
        return this.updateGeneric(id, this.MENUS_KEY, menu, Menu, ['id']);
    }

    async replaceMenu(id: string, menu: Menu): Promise<Menu> {
        if (!this.idExists(id, this.MENUS_KEY)) {
            throw new DataProviderError(`${id} not found`, 404);
        }
        this.validateMenu(menu);
        const replacement = new Menu(id, menu.internalName, menu.displayName, menu.logo, menu.defaultBreweryId);
        this._cache.get(this.MENUS_KEY)!.set(id, replacement);
        return replacement;
    }

    validateSubMenu(item: SubMenu) {
        if (item.menuId && !this.idExists(item.menuId, this.MENUS_KEY)) {
            this.missingReference('Menu', item.menuId, `TODO: Do an error here because ID ${item.menuId} does not exist for menus when adding ${item.id}`);
        }
    }

    async addSubMenu(subMenu: SubMenu): Promise<SubMenu> {
        this.validateSubMenu(subMenu);
        return this.addGeneric(subMenu, this.SUBMENUS_KEY);
    }

    async getSubMenu(id: string): Promise<SubMenu | null> {
        return this.getGeneric(id, this.SUBMENUS_KEY);
    }

    async getSubMenusForMenu(menuId: string): Promise<Array<SubMenu>> {
        const subMenus = this.visibleValues(this.SUBMENUS_KEY);
        const results: Array<SubMenu> = [];
        subMenus.forEach((value: SubMenu) => {
            if (value.menuId === menuId) {
                results.push(value);
            }
        });

        results.sort((a: SubMenu, b: SubMenu) => (a.order ? a.order : 999) - (b.order ? b.order : 999));
        return results;
    }

    async updateSubMenu(id: string, subMenu: SubMenu): Promise<SubMenu> {
        this.validateSubMenu(subMenu);
        return this.updateGeneric(id, this.SUBMENUS_KEY, subMenu, SubMenu, ['id']);
    }

    async removeSubMenu(id: string): Promise<boolean> {
        if (!this.idExists(id, this.SUBMENUS_KEY)) {
            return false;
        }
        const menuItems = await this.getMenuItemsForSubMenu(id);
        for (const menuItem of menuItems) {
            const saleContainers = await this.getSaleContainersForMenuItem(menuItem.id!);
            for (const saleContainer of saleContainers) {
                this.removeGeneric(saleContainer.id!, this.SALE_CONTAINERS_KEY);
            }
            this.removeGeneric(menuItem.id!, this.MENU_ITEMS_KEY);
        }
        return this.removeGeneric(id, this.SUBMENUS_KEY);
    }

    validateMenuItem(item: MenuItem) {
        if (item.menuId && !this.idExists(item.menuId, this.MENUS_KEY)) {
            this.missingReference('Menu', item.menuId, `TODO: Do an error here because ID ${item.menuId} does not exist for menus`);
        }
        if (item.itemId && !this.idExists(item.itemId, this.ITEMS_KEY)) {
            this.missingReference('Item', item.itemId, `TODO: Do an error here because ID ${item.itemId} does not exist for items`);
        }
        if (item.subMenuId && !this.idExists(item.subMenuId, this.SUBMENUS_KEY)) {
            this.missingReference('Sub Menu', item.subMenuId, `TODO: Do an error here because ID ${item.subMenuId} does not exist for submenus`);
        }
    }

    async addMenuItem(item: MenuItem): Promise<MenuItem> {
        this.validateMenuItem(item);
        // Normalized to a MenuItem so every entry has the same fields (updateGeneric relies on it)
        const toAdd = new MenuItem(item.id, item.menuId, item.itemId, item.subMenuId, item.itemLogo ?? null, item.order ?? null, item.active ?? true);
        return this.addGeneric(toAdd, this.MENU_ITEMS_KEY);
    }

    async getMenuItem(id: string): Promise<MenuItem | null> {
        return this.getGeneric(id, this.MENU_ITEMS_KEY);
    }

    async getMenuItemsForMenu(menuId: string): Promise<Array<MenuItem>> {
        const itemMap = this.visibleValues(this.MENU_ITEMS_KEY);
        const results: Array<MenuItem> = [];
        itemMap.forEach((value: MenuItem) => {
            if (value.menuId === menuId) {
                results.push(value);
            }
        });

        return results;
    }

    async getMenuItemsForSubMenu(subMenuId: string): Promise<Array<MenuItem>> {
        const itemMap = this.visibleValues(this.MENU_ITEMS_KEY);
        
        const results: Array<MenuItem> = [];
        itemMap.forEach((value: MenuItem) => {
            if (value.subMenuId === subMenuId) {
                results.push(value);
            }
        });

        return results; 
    }

    async getMenuItemsForItem(itemId: string): Promise<Array<MenuItem>> {
        // Maps iterate in insertion order (updates keep an entry's place), so this is oldest first
        const results: Array<MenuItem> = [];
        this.visibleValues(this.MENU_ITEMS_KEY).forEach((value: MenuItem) => {
            if (value.itemId === itemId) {
                results.push(value);
            }
        });
        return results;
    }

    async removeMenuItem(id: string): Promise<boolean> {
        return this.removeGeneric(id, this.MENU_ITEMS_KEY);
    }

    async updateMenuItem(id: string, item: MenuItem): Promise<MenuItem> {
        this.validateMenuItem(item);
        // `active` is left alone (updateGeneric can't set a field to false; see setMenuItemActive)
        return this.updateGeneric(id, this.MENU_ITEMS_KEY, { ...item, active: null }, MenuItem, ["id"]);
    }

    async setMenuItemActive(id: string, active: boolean): Promise<MenuItem> {
        const original: MenuItem | null = this.getGeneric(id, this.MENU_ITEMS_KEY);
        if (original === null) {
            throw new DataProviderError(`${id} not found`, 404);
        }
        // Setting an existing key keeps its place in the map, so getMenuItemsForItem stays oldest first
        const updated = new MenuItem(original.id, original.menuId, original.itemId, original.subMenuId, original.itemLogo, original.order, active);
        this._cache.get(this.MENU_ITEMS_KEY)!.set(id, updated);
        return updated;
    }

    async setMenuItemLogo(id: string, itemLogo: string | null): Promise<MenuItem> {
        const original: MenuItem | null = this.getGeneric(id, this.MENU_ITEMS_KEY);
        if (original === null) {
            throw new DataProviderError(`${id} not found`, 404);
        }
        // updateGeneric can't clear a field, so rebuild the entry (keeping its place in the map)
        const updated = new MenuItem(original.id, original.menuId, original.itemId, original.subMenuId, itemLogo, original.order, original.active ?? true);
        this._cache.get(this.MENU_ITEMS_KEY)!.set(id, updated);
        return updated;
    }

    async createUser(user: NewUser): Promise<User> {
        const email = normalizeEmail(user.email);
        if (await this.getUserByEmail(email)) {
            throw new DataProviderError('An account with that email already exists', 409);
        }
        const created: User = {
            id: uuidv4(),
            email: email,
            displayName: user.displayName ?? null,
            passwordHash: user.passwordHash ?? null,
            role: user.role ?? 'USER',
            status: user.status ?? 'PENDING',
            createdAt: new Date(),
            approvedAt: null,
            approvedById: null,
        };
        this._cache.get(this.USERS_KEY)!.set(created.id, created);
        return { ...created };
    }

    async getUser(id: string): Promise<User | null> {
        const user: User | undefined = this._cache.get(this.USERS_KEY)!.get(id);
        return user ? { ...user } : null;
    }

    async getUserByEmail(email: string): Promise<User | null> {
        const wanted = normalizeEmail(email);
        for (const user of this._cache.get(this.USERS_KEY)!.values() as IterableIterator<User>) {
            if (user.email === wanted) {
                return { ...user };
            }
        }
        return null;
    }

    async getUsers(): Promise<Array<User>> {
        const users: User[] = [...(this._cache.get(this.USERS_KEY)!.values() as IterableIterator<User>)];
        // Oldest first; accounts made in the same millisecond stay in the order they were made
        return users.map((user) => ({ ...user })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    async updateUser(id: string, fields: UserUpdate): Promise<User> {
        const users = this._cache.get(this.USERS_KEY)!;
        const existing: User | undefined = users.get(id);
        if (!existing) {
            throw new DataProviderError(`User with ID ${id} does not exist`, 404);
        }
        const changes = { ...fields };
        if (changes.email !== undefined) {
            changes.email = normalizeEmail(changes.email);
            const taken = await this.getUserByEmail(changes.email);
            if (taken && taken.id !== id) {
                throw new DataProviderError('An account with that email already exists', 409);
            }
        }
        const updated: User = { ...existing, ...changes };
        users.set(id, updated);
        return { ...updated };
    }

    async countUsers(): Promise<number> {
        return this._cache.get(this.USERS_KEY)!.size;
    }

    async createSession(session: Session): Promise<Session> {
        const created: Session = { id: session.id, userId: session.userId, createdAt: session.createdAt ?? new Date(), expiresAt: session.expiresAt };
        this._cache.get(this.SESSIONS_KEY)!.set(created.id, created);
        return { ...created };
    }

    async getSession(id: string): Promise<Session | null> {
        const session: Session | undefined = this._cache.get(this.SESSIONS_KEY)!.get(id);
        return session ? { ...session } : null;
    }

    async deleteSession(id: string): Promise<void> {
        this._cache.get(this.SESSIONS_KEY)!.delete(id);
    }
    async deleteSessionsForUser(userId: string, exceptSessionId?: string): Promise<void> {
        const sessions = this._cache.get(this.SESSIONS_KEY)!;
        for (const [id, session] of [...sessions.entries()]) {
            if (session.userId === userId && id !== exceptSessionId) {
                sessions.delete(id);
            }
        }
    }

    async deleteExpiredSessions(now: Date): Promise<number> {
        const sessions = this._cache.get(this.SESSIONS_KEY)!;
        let removed = 0;
        for (const [id, session] of [...sessions.entries()] as [string, Session][]) {
            if (session.expiresAt.getTime() < now.getTime()) {
                sessions.delete(id);
                removed++;
            }
        }
        return removed;
    }
}
