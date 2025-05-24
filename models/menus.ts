// Represents a collection of items to form a menu
export class Menu {
    id: number;
    internalName: string;
    displayName: string;

    constructor(id: number, internalName: string, displayName: string) {
        this.id = id;
        this.internalName = internalName;
        this.displayName = displayName;
    }

    static fromJsonEntry(entry: any): Menu {
        return new Menu(entry.id, entry.internalName, entry.displayName);
    }
}

// A particular sub-heading on a menu. Used to organize items within a menu
export class SubMenu {
    id: number;
    internalName: string;
    displayName: string;
    menuId: number;
    
    constructor(id: number, internalName: string, displayName: string, menuId: number) {
        this.id = id;
        this.internalName = internalName;
        this.displayName = displayName;
        this.menuId = menuId;
    }

    static fromJsonEntry(entry: any): SubMenu {
        return new SubMenu(entry.id, entry.internalName, entry.displayName, entry.menuId);
    }
}

// A join of Menu and Item. Also contains the particular sub-menu the item might appear on
export class MenuItem {
    id: number;
    menuId: number;
    itemId: number;
    subMenuId: number | null;
    itemLogo: string | null;

    constructor(id: number, menuId: number, itemId: number, subMenuId: number | null, itemLogo: string | null) {
        this.id = id;
        this.menuId = menuId;
        this.itemId = itemId;
        this.subMenuId = subMenuId;
        this.itemLogo = itemLogo;
    }

    static fromJsonEntry(entry: any): MenuItem {
        return new MenuItem(entry.id, entry.menuId, entry.itemId, entry.subMenuId, entry.itemLogo);
    }
}