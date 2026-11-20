/**
 * Message class for Arlo protocol communication
 * Handles serialization and deserialization of messages
 */
export class Message {
  private dictionary: Record<string, unknown>;

  constructor(dictionary: Record<string, unknown>) {
    this.dictionary = { ...dictionary };
  }

  get(key: string): unknown {
    return this.dictionary[key];
  }

  set(key: string, value: unknown): void {
    this.dictionary[key] = value;
  }

  has(key: string): boolean {
    return key in this.dictionary;
  }

  /**
   * Get the raw dictionary
   */
  getDict(): Record<string, unknown> {
    return { ...this.dictionary };
  }

  /**
   * Convert message to network format: "L:length jsondata"
   */
  toNetworkMessage(): string {
    const msgJson = JSON.stringify(this.dictionary);
    const length = msgJson.length;
    return `L:${length} ${msgJson}`;
  }

  /**
   * Convert message to network bytes
   */
  toNetworkBytes(): Buffer {
    return Buffer.from(this.toNetworkMessage(), "utf-8");
  }

  /**
   * Convert message to JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.dictionary);
  }

  /**
   * String representation (compact JSON)
   */
  toString(): string {
    return JSON.stringify(this.dictionary);
  }

  /**
   * Pretty string representation (formatted JSON)
   */
  toPrettyString(): string {
    return JSON.stringify(this.dictionary, null, 2);
  }

  /**
   * Create a Message from JSON data
   */
  static fromJSON(jsonData: string | null | undefined): Message | null {
    if (jsonData && jsonData !== "None") {
      try {
        return new Message(JSON.parse(jsonData));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Create a Message from object
   */
  static fromObject(obj: Record<string, unknown>): Message {
    return new Message(obj);
  }
}
