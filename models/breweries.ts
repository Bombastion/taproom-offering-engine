// Metadata about a brewery
export class Brewery {
    id: number;
    name: string;
    // A b64 encoded string representing an image for the brewery
    defaultLogo: string;
    location: string;

    constructor(id: number, name: string, b64EncodedLogo: string, location: string) {
        this.id = id;
        this.name = name;
        this.defaultLogo = b64EncodedLogo;
        this.location = location
    }

    static fromJsonEntry(entry: any): Brewery {
        return new Brewery(entry.id, entry.name, entry.b64EncodedLogo, entry.location);
    }
}
