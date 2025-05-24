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
}

// A particular sub-heading on a menu. Used to organize items within a menu
export class SubMenu {
    id: number;
    internalName: string;
    displayName: string;
    
    constructor(id: number, internalName: string, displayName: string) {
        this.id = id;
        this.internalName = internalName;
        this.displayName = displayName;
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
}