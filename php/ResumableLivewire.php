<?php

declare(strict_types=1);

namespace ResumableJs;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\UploadedFile;

/**
 * ResumableLivewire - Backend handler for Livewire-based resumable.js uploads
 * 
 * This handler is designed to work with the Livewire edition of resumable.js
 * where chunks are uploaded via Livewire's native upload functionality.
 * 
 * @see https://livewire.laravel.com/docs/uploads
 */
class ResumableLivewire
{
    /**
     * Debug mode is enabled
     */
    protected bool $debug = false;

    /**
     * Temporary folder for chunks (relative to storage disk)
     */
    public string $tempFolder = 'resumable-chunks';

    /**
     * Final upload folder (relative to storage disk)
     */
    public string $uploadFolder = 'uploads';

    /**
     * Storage disk name
     */
    protected string $disk = 'local';

    /**
     * Override the filename that will be given by setting this to a value
     * Before handling is done
     */
    protected ?string $filename = null;

    protected string $filepath = '';

    protected string $originalFilename = '';

    protected bool $isUploadComplete = false;

    /**
     * Chunk metadata from the request
     */
    protected array $chunkMetadata = [];

    /**
     * Resumable.js parameter names
     */
    protected array $resumableOption = [
        'identifier' => 'resumableIdentifier',
        'filename' => 'resumableFilename',
        'chunkNumber' => 'resumableChunkNumber',
        'chunkSize' => 'resumableChunkSize',
        'totalSize' => 'resumableTotalSize',
        'totalChunks' => 'resumableTotalChunks',
        'currentChunkSize' => 'resumableCurrentChunkSize',
        'type' => 'resumableType',
        'relativePath' => 'resumableRelativePath',
        'fileCategory' => 'resumableFileCategory',
    ];

    /**
     * Constructor
     * 
     * @param string|null $disk Storage disk name (default: 'local')
     */
    public function __construct(?string $disk = null)
    {
        if ($disk !== null) {
            $this->disk = $disk;
        }
    }

    /**
     * Set custom resumable parameter names
     */
    public function setResumableOption(array $resumableOption): void
    {
        $this->resumableOption = array_merge($this->resumableOption, $resumableOption);
    }

    /**
     * Process a chunk upload from Livewire
     * 
     * This method should be called from your Livewire component's updatedUpload() method
     * 
     * @param UploadedFile $uploadedFile The file uploaded via Livewire
     * @param array $metadata Chunk metadata from the JavaScript (usually from request())
     * @return bool True if upload is complete, false if more chunks needed
     */
    public function handleChunk(UploadedFile $uploadedFile, array $metadata): bool
    {
        $this->chunkMetadata = $metadata;

        $identifier = $this->getMetadata('identifier');
        $filename = $this->getMetadata('filename');
        $chunkNumber = (int) $this->getMetadata('chunkNumber');
        $totalChunks = (int) $this->getMetadata('totalChunks');

        $this->log('Processing chunk upload', [
            'identifier' => $identifier,
            'filename' => $filename,
            'chunkNumber' => $chunkNumber,
            'totalChunks' => $totalChunks,
        ]);

        if (!$identifier || !$filename || $chunkNumber <= 0 || $totalChunks <= 0) {
            $this->log('Invalid chunk metadata', $metadata);
            throw new \InvalidArgumentException('Invalid chunk metadata');
        }

        // Save the chunk
        $this->saveChunk($uploadedFile, $identifier, $filename, $chunkNumber);

        // Check if upload is complete
        if ($this->isFileUploadComplete($filename, $identifier, $totalChunks)) {
            $this->isUploadComplete = true;
            $this->log('All chunks received, creating final file', [
                'identifier' => $identifier,
                'filename' => $filename,
            ]);
            
            $this->createFileAndDeleteTmp($identifier, $filename, $totalChunks);
            return true;
        }

        return false;
    }

    /**
     * Check if a specific chunk has been uploaded
     * 
     * This can be used to implement chunk testing (testChunks option in resumable.js)
     * 
     * @param string $identifier Unique identifier for the upload
     * @param string $filename Original filename
     * @param int $chunkNumber Chunk number (1-indexed)
     * @return bool True if chunk exists
     */
    public function isChunkUploaded(string $identifier, string $filename, int $chunkNumber): bool
    {
        $chunkPath = $this->getChunkPath($identifier, $filename, $chunkNumber);
        return Storage::disk($this->disk)->exists($chunkPath);
    }

    /**
     * Check if all chunks have been uploaded
     * 
     * @param string $filename Original filename
     * @param string $identifier Unique identifier for the upload
     * @param int $totalChunks Total number of chunks
     * @return bool True if all chunks are present
     */
    public function isFileUploadComplete(string $filename, string $identifier, int $totalChunks): bool
    {
        for ($i = 1; $i <= $totalChunks; $i++) {
            if (!$this->isChunkUploaded($identifier, $filename, $i)) {
                $this->log('Missing chunk', [
                    'identifier' => $identifier,
                    'chunkNumber' => $i,
                    'totalChunks' => $totalChunks,
                ]);
                return false;
            }
        }
        return true;
    }

    /**
     * Get upload completion status
     */
    public function isUploadComplete(): bool
    {
        return $this->isUploadComplete;
    }

    /**
     * Set final filename
     */
    public function setFilename(string $filename): self
    {
        $this->filename = $filename;
        return $this;
    }

    /**
     * Get final filename
     */
    public function getFilename(): string
    {
        return $this->filename;
    }

    /**
     * Get original filename
     */
    public function getOriginalFilename(): string
    {
        return $this->originalFilename;
    }

    /**
     * Get final filepath
     */
    public function getFilepath(): string
    {
        return $this->filepath;
    }

    /**
     * Set storage disk
     */
    public function setDisk(string $disk): self
    {
        $this->disk = $disk;
        return $this;
    }

    /**
     * Set debug mode
     */
    public function setDebug(bool $debug): self
    {
        $this->debug = $debug;
        return $this;
    }

    /**
     * Save a chunk to storage
     */
    protected function saveChunk(UploadedFile $file, string $identifier, string $filename, int $chunkNumber): void
    {
        $chunkPath = $this->getChunkPath($identifier, $filename, $chunkNumber);
        
        $this->log('Saving chunk', [
            'path' => $chunkPath,
            'size' => $file->getSize(),
        ]);

        // Store the chunk
        Storage::disk($this->disk)->put(
            $chunkPath,
            $file->get()
        );
    }

    /**
     * Create final file from all chunks and clean up
     */
    protected function createFileAndDeleteTmp(string $identifier, string $filename, int $totalChunks): void
    {
        $this->originalFilename = $filename;

        // If user hasn't set a custom filename, sanitize the original
        if ($this->filename === null) {
            $this->filename = $this->createSafeName($filename);
            $this->log('Created safe filename', ['filename' => $this->filename]);
        }

        // Set final filepath
        $this->filepath = $this->uploadFolder . DIRECTORY_SEPARATOR . $this->filename;

        $this->log('Creating final file', [
            'filepath' => $this->filepath,
            'totalChunks' => $totalChunks,
        ]);

        // Create final file from chunks
        $finalFileCreated = $this->createFileFromChunks($identifier, $filename, $totalChunks, $this->filepath);

        if (!$finalFileCreated) {
            $this->log('Failed to create final file', ['filepath' => $this->filepath]);
            return;
        }

        $this->log('Final file created successfully', ['filepath' => $this->filepath]);

        // Clean up chunks
        $this->cleanupChunks($identifier, $filename, $totalChunks);
    }

    /**
     * Assemble final file from chunks
     */
    protected function createFileFromChunks(
        string $identifier,
        string $filename,
        int $totalChunks,
        string $destPath
    ): bool {
        if (Storage::disk($this->disk)->exists($destPath)) {
            $this->log('Final file already exists', ['path' => $destPath]);
            return false;
        }

        $this->log('Assembling chunks into final file');

        $finalContent = '';

        // Read and concatenate all chunks in order
        for ($i = 1; $i <= $totalChunks; $i++) {
            $chunkPath = $this->getChunkPath($identifier, $filename, $i);
            
            if (!Storage::disk($this->disk)->exists($chunkPath)) {
                $this->log('Missing chunk during assembly', [
                    'chunkNumber' => $i,
                    'chunkPath' => $chunkPath,
                ]);
                return false;
            }

            $finalContent .= Storage::disk($this->disk)->get($chunkPath);
            
            $this->log('Appended chunk to final file', [
                'chunkNumber' => $i,
                'totalChunks' => $totalChunks,
            ]);
        }

        // Write final file
        Storage::disk($this->disk)->put($destPath, $finalContent);

        return Storage::disk($this->disk)->exists($destPath);
    }

    /**
     * Clean up chunk files after successful upload
     */
    protected function cleanupChunks(string $identifier, string $filename, int $totalChunks): void
    {
        $this->log('Cleaning up chunks');

        for ($i = 1; $i <= $totalChunks; $i++) {
            $chunkPath = $this->getChunkPath($identifier, $filename, $i);
            
            if (Storage::disk($this->disk)->exists($chunkPath)) {
                Storage::disk($this->disk)->delete($chunkPath);
                $this->log('Deleted chunk', ['chunkPath' => $chunkPath]);
            }
        }

        // Try to delete the chunk directory
        $chunkDir = $this->getChunkDirectory($identifier);
        
        try {
            // Delete directory if empty
            Storage::disk($this->disk)->deleteDirectory($chunkDir);
            $this->log('Deleted chunk directory', ['directory' => $chunkDir]);
        } catch (\Exception $e) {
            $this->log('Could not delete chunk directory', [
                'directory' => $chunkDir,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Get the path for a specific chunk
     */
    protected function getChunkPath(string $identifier, string $filename, int $chunkNumber): string
    {
        $chunkDir = $this->getChunkDirectory($identifier);
        $chunkFilename = $this->tmpChunkFilename($filename, $chunkNumber);
        
        return $chunkDir . DIRECTORY_SEPARATOR . $chunkFilename;
    }

    /**
     * Get the directory for storing chunks of a specific upload
     */
    protected function getChunkDirectory(string $identifier): string
    {
        return $this->tempFolder . DIRECTORY_SEPARATOR . $this->createSafeName($identifier);
    }

    /**
     * Generate chunk filename
     * 
     * @example mock-file.png.0001 For a filename "mock-file.png"
     */
    protected function tmpChunkFilename(string $filename, int $chunkNumber): string
    {
        return $this->createSafeName($filename) . '.' . str_pad((string) $chunkNumber, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Create a safe filename
     */
    protected function createSafeName(string $name): string
    {
        // Remove any path components
        $name = basename($name);
        
        // Replace any non-alphanumeric characters (except dots, dashes, and underscores)
        $name = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
        
        // Remove any consecutive underscores
        $name = preg_replace('/_+/', '_', $name);
        
        // Remove leading/trailing underscores
        $name = trim($name, '_');
        
        return $name;
    }

    /**
     * Get metadata value from chunk metadata
     */
    protected function getMetadata(string $key): mixed
    {
        $paramName = $this->resumableOption[$key] ?? null;
        
        if ($paramName === null) {
            return null;
        }

        return $this->chunkMetadata[$paramName] ?? null;
    }

    /**
     * Log a message if debug is enabled
     */
    protected function log(string $message, array $context = []): void
    {
        if ($this->debug) {
            Log::debug('[ResumableLivewire] ' . $message, $context);
        }
    }
}
