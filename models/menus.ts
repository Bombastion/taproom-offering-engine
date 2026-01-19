// Represents a collection of items to form a menu
export class Menu {
    id: number | null;
    internalName: string | null;
    displayName: string | null;
    // A b64 string representing the logo
    logo: string | null;

    constructor(id: number | null, internalName: string | null, displayName: string | null, logo: string | null) {
        this.id = id;
        this.internalName = internalName;
        this.displayName = displayName;
        this.logo = logo;
    }

    static fromJsonEntry(entry: any): Menu {
        return new Menu(entry.id, entry.internalName, entry.displayName, entry.logo);
    }
}

// A particular sub-heading on a menu. Used to organize items within a menu
export class SubMenu {
    id: number | null;
    internalName: string | null;
    displayName: string | null;
    menuId: number | null;
    order: number | null;
    
    constructor(id: number | null, internalName: string | null, displayName: string | null, menuId: number | null, order: number | null) {
        this.id = id;
        this.internalName = internalName;
        this.displayName = displayName;
        this.menuId = menuId;
        this.order = order;
    }

    static fromJsonEntry(entry: any): SubMenu {
        return new SubMenu(entry.id, entry.internalName, entry.displayName, entry.menuId, entry.order);
    }
}

export class DisplaySubMenu {
    menu: SubMenu;
    // Keeps track of which container options to display for a submenu
    containerOptions: Array<string>;

    constructor(menu: SubMenu, containerOptions: Array<string>) {
        this.menu = menu;
        this.containerOptions = containerOptions;
    }
}

// A join of Menu and Item. Also contains the particular sub-menu the item might appear on
export class MenuItem {
    id: number | null;
    menuId: number | null;
    itemId: string | null;
    subMenuId: number | null;
    itemLogo: string | null;
    order: number | null;

    constructor(id: number | null, menuId: number | null, itemId: string | null, subMenuId: number | null, itemLogo: string | null, order: number | null) {
        this.id = id;
        this.menuId = menuId;
        this.itemId = itemId;
        this.subMenuId = subMenuId;
        this.itemLogo = itemLogo;
        this.order = order;
    }

    static fromJsonEntry(entry: any): MenuItem {
        return new MenuItem(entry.id, entry.menuId, entry.itemId, entry.subMenuId, entry.itemLogo, entry.order);
    }
}

export class DisplayItem {
    breweryName: string | null;
    displayName: string;
    style: string | null;
    abv: number | null;
    description: string | null;
    order: number | null;
    containerDisplayNameToPrice: Map<string, string>;

    constructor(breweryName: string | null, displayName: string, style: string | null, abv: number | null, description: string | null, order: number | null, containerDisplayNameToPrice: Map<string, string>) {
        this.breweryName = breweryName;
        this.displayName = displayName;
        this.style = style;
        this.abv = abv;
        this.description = description;
        this.order = order;
        this.containerDisplayNameToPrice = containerDisplayNameToPrice;
    }
}
