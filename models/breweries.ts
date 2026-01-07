// Metadata about a brewery
export class Brewery {
    id: number | null;
    name: string | null;
    // A b64 encoded string representing an image for the brewery
    defaultLogo: string | null;
    location: string | null;

    constructor(id: number | null, name: string | null, b64EncodedLogo: string | null, location: string | null) {
        this.id = id;
        this.name = name;
        this.defaultLogo = b64EncodedLogo;
        this.location = location
    }

    static fromJsonEntry(entry: any): Brewery {
        return new Brewery(entry.id, entry.name, entry.b64EncodedLogo, entry.location);
    }
}
