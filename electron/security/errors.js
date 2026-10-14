export class AppError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AppError';
        this.code = code;
    }
}

export class ValidationError extends AppError {
  constructor(message) {
    super("EVALIDATION", message);
    this.name = "ValidationError";
  }
}

export function friendlyError(err, fallback = 'Something went wrong') {
    if( err instanceof AppError) return err;
    const code = err && err.code;
    switch (code) {
      case "ENOSPC":
      case "SQLITE_FULL":
        return new AppError(
          "ENOSPC",
          "The disk is full. Free some space and try again.",
        );
      case "EACCES":
      case "EPERM":
      case "SQLITE_READONLY":
      case "SQLITE_PERM":
        return new AppError(
          "EACCES",
          "Permission denied. Choose another location or check folder permissions.",
        );
      case "ENOENT":
        return new AppError("ENOENT", "The file or folder no longer exists.");
      case "EISDIR":
        return new AppError("EISDIR", "That path is a folder, not a file.");
      case "EROFS":
        return new AppError("EROFS", "The destination is read-only.");
      case "SQLITE_CORRUPT":
      case "SQLITE_NOTADB":
        return new AppError(
          "ECORRUPT",
          "The database file is damaged. Restart the app to run automatic recovery.",
        );
      case "SQLITE_BUSY":
      case "SQLITE_LOCKED":
        return new AppError("EBUSY", "The database is busy. Please try again.");
      default:
        return new AppError("EINTERNAL", fallback);
    }
}