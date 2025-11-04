/**
 * TypeScript definitions for Resumable.js Livewire Edition
 */

export interface ResumableOptions {
  /** Livewire component reference (@this) */
  livewireComponent: any;
  
  /** Property name for upload binding (default: 'upload') */
  livewireProperty?: string;
  
  /** Size of each chunk in bytes (default: 1MB) */
  chunkSize?: number;
  
  /** Number of simultaneous uploads (default: 3) */
  simultaneousUploads?: number;
  
  /** Test chunks before uploading for resumability (default: true) */
  testChunks?: boolean;
  
  /** Maximum chunk retries (default: 100) */
  maxChunkRetries?: number;
  
  /** Retry interval in milliseconds */
  chunkRetryInterval?: number;
  
  /** Array of accepted file types (e.g., ['image/*', '.pdf']) */
  fileTypes?: string[];
  
  /** Maximum file size in bytes */
  maxFileSize?: number;
  
  /** Minimum file size in bytes (default: 1) */
  minFileSize?: number;
  
  /** Maximum number of files */
  maxFiles?: number;
  
  /** File categories */
  fileCategories?: string[];
  
  /** Default file category */
  defaultFileCategory?: string | null;
  
  /** Clear input after file selection (default: true) */
  clearInput?: boolean;
  
  /** CSS class to add when dragging over drop zone (default: 'dragover') */
  dragOverClass?: string;
  
  /** Prioritize first and last chunk */
  prioritizeFirstAndLastChunk?: boolean;
  
  /** Custom query parameters (function or object) */
  query?: Record<string, any> | ((file: ResumableFile, chunk: ResumableChunk) => Record<string, any>);
  
  /** Generate unique identifier function */
  generateUniqueIdentifier?: (file: File) => string;
  
  /** Throttle progress callbacks (seconds, default: 0.5) */
  throttleProgressCallbacks?: number;
  
  /** Debug verbosity level (0-3) */
  debugVerbosityLevel?: number;
  
  /** Error callbacks */
  fileTypeErrorCallback?: (file: File) => void;
  maxFileSizeErrorCallback?: (file: File) => void;
  minFileSizeErrorCallback?: (file: File) => void;
  maxFilesErrorCallback?: (files: File[]) => void;
  fileValidationErrorCallback?: (file: File) => void;
}

export interface ResumableFile {
  readonly file: File;
  readonly fileName: string;
  readonly size: number;
  readonly relativePath: string;
  readonly uniqueIdentifier: string;
  readonly fileCategory: string;
  readonly chunks: ResumableChunk[];
  isPaused: boolean;
  
  abort(): void;
  cancel(): void;
  retry(): void;
  bootstrap(): void;
  progress(): number;
  isUploading(): boolean;
  isComplete(): boolean;
}

export interface ResumableChunk {
  readonly fileObj: ResumableFile;
  readonly offset: number;
  readonly startByte: number;
  readonly endByte: number;
  tested: boolean;
  retries: number;
  
  send(): void;
  abort(): void;
  status: string;
  progress(): number;
}

export class Resumable {
  constructor(options?: ResumableOptions);
  
  /** Support detection */
  readonly support: boolean;
  
  /** Configuration options */
  opts: ResumableOptions;
  
  /** Files organized by category */
  files: Record<string, ResumableFile[]>;
  
  /** Assign browse button */
  assignBrowse(domNodes: HTMLElement | HTMLElement[], isDirectory?: boolean, fileCategory?: string): void;
  
  /** Assign drop zone */
  assignDrop(domNodes: HTMLElement | HTMLElement[], fileCategory?: string): void;
  
  /** Unassign drop zone */
  unAssignDrop(domNodes: HTMLElement | HTMLElement[]): void;
  
  /** Add file */
  addFile(file: File, fileCategory?: string): void;
  
  /** Add files */
  addFiles(files: File[], fileCategory?: string): void;
  
  /** Remove file */
  removeFile(file: ResumableFile): void;
  
  /** Get file by unique identifier */
  getFromUniqueIdentifier(uniqueIdentifier: string): ResumableFile | undefined;
  
  /** Get size */
  getSize(): number;
  
  /** Upload */
  upload(fileCategory?: string): void;
  
  /** Pause */
  pause(fileCategory?: string): void;
  
  /** Cancel */
  cancel(fileCategory?: string): void;
  
  /** Progress */
  progress(): number;
  
  /** Is uploading */
  isUploading(): boolean;
  
  /** Event handlers */
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback?: (...args: any[]) => void): void;
  fire(event: string, ...args: any[]): void;
}

export default Resumable;
