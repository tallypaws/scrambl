export class InvalidCommandUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommandUsageError";
  }
}