<?php

declare(strict_types=1);

namespace App\Traits;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\UploadedFile;

/**
 * Trait HandlesResumableUploads
 * 
 * A simple trait for handling Livewire-based resumable uploads.
 * Uses Livewire's native upload callbacks for handling events.
 * 
 * Usage:
 * 1. Add this trait to your Livewire component
 * 2. Define a public property for the upload (e.g., public $upload)
 * 3. The trait will automatically handle chunk assembly
 * 
 * @example
 * use App\Traits\HandlesResumableUploads;
 * 
 * class FileUploader extends Component
 * {
 *     use WithFileUploads, HandlesResumableUploads;
 *     
 *     public $upload;
 *     
 *     protected function onUploadComplete(string $filepath, string $filename)
 *     {
 *         // Called when all chunks are assembled
 *     }
 * }
 */
trait HandlesResumableUploads
{
    /**
     * Storage disk for chunks and final files
     */
    protected string $resumableDisk = 'local';

    /**
     * Temporary folder for chunks
     */
    protected string $resumableTempFolder = 'resumable-chunks';

    /**
     * Final upload folder
     */
    protected string $resumableUploadFolder = 'uploads';

    /**
     * Track completed uploads
     */
    protected array $completedUploads = [];

    /**
     * Cache storage disk instance
     */
    private $storageDiskCache = null;

    /**
     * Check if a chunk exists (for resumability / chunk testing)
     * 
     * This method is called from JavaScript to check if a chunk already exists
     * before attempting to upload it. Essential for resumability.
     * 
     * @param string $identifier Unique upload identifier
     * @param string $filename Original filename
     * @param int $chunkNumber Chunk number (1-indexed)
     * @return bool True if chunk exists
     */
    public function checkChunk(string $identifier, string $filename, int $chunkNumber): bool
    {
        return $this->chunkExists($identifier, $filename, $chunkNumber);
    }

    /**
     * Cancel an upload and clean up its chunks
     * 
     * This method handles user cancellation of uploads. It deletes the entire
     * chunk directory for the upload, effectively removing all traces of it.
     * 
     * @param string $identifier Unique upload identifier
     * @param string $filename Original filename
     * @return void
     */
    public function cancelUpload(string $identifier, string $filename): void
    {
        $chunkDir = $this->getChunkDirectory($identifier);
        
        try {
            // Delete the entire directory at once (more efficient than individual files)
            if ($this->disk()->exists($chunkDir)) {
                $this->disk()->deleteDirectory($chunkDir);
            }
        } catch (\Exception $e) {
            Log::error('Error cancelling upload', [
                'identifier' => $identifier,
                'filename' => $filename,
                'error' => $e->getMessage(),
            ]);
        }

        // Call the hook if defined
        if (method_exists($this, 'onUploadCancelled')) {
            $this->onUploadCancelled($identifier, $filename);
        }

        // Emit cancelled event to JavaScript
        $this->dispatch('upload:cancelled', [
            'identifier' => $identifier,
            'filename' => $filename,
        ]);
    }

    /**
     * Process uploaded chunk automatically
     * 
     * This method is called automatically by Livewire when the upload property changes
     */
    public function updatedUpload(): void
    {
        // Get chunk metadata from request
        $metadata = $this->getChunkMetadata();

        if (!$this->isValidChunkMetadata($metadata)) {
            $this->handleInvalidChunk($metadata);
            return;
        }

        $identifier = $metadata['resumableIdentifier'];
        $originalFilename = $metadata['resumableFilename'];
        $chunkNumber = (int) $metadata['resumableChunkNumber'];

        try {
            // Validate file size before proceeding
            $totalSize = (int) ($metadata['resumableTotalSize'] ?? 0);
            if ($totalSize > 0 && $this->maxUploadSize() && $totalSize > $this->maxUploadSize()) {
                throw new \RuntimeException(
                    "File '{$originalFilename}' exceeds maximum allowed size of " . 
                    $this->formatBytes($this->maxUploadSize())
                );
            }

            // Save the chunk
            $this->saveChunk($this->upload, $metadata);

            // Check if upload is complete
            if ($this->isUploadComplete($metadata)) {
                $finalPath = $this->assembleChunks($metadata);
                
                if ($finalPath) {
                    $this->completedUploads[] = [
                        'original' => $originalFilename,
                        'path' => $finalPath,
                        'uploaded_at' => now(),
                    ];

                    // Call the hook if defined
                    if (method_exists($this, 'onUploadComplete')) {
                        $this->onUploadComplete($finalPath, $originalFilename);
                    }

                    // Emit success event to JavaScript
                    $this->dispatch('upload:complete', [
                        'filename' => basename($finalPath),
                        'path' => $finalPath,
                    ]);
                }
            }

            // Reset upload property for next chunk
            $this->upload = null;

        } catch (\Exception $e) {
            $this->handleUploadError($e, $metadata, $chunkNumber);
        }
    }

    /**
     * Get chunk metadata from the request
     */
    protected function getChunkMetadata(): array
    {
        return request()->only([
            'resumableChunkNumber',
            'resumableTotalChunks',
            'resumableIdentifier',
            'resumableFilename',
            'resumableChunkSize',
            'resumableTotalSize',
            'resumableCurrentChunkSize',
            'resumableType',
            'resumableRelativePath',
        ]);
    }

    /**
     * Validate chunk metadata
     */
    protected function isValidChunkMetadata(array $metadata): bool
    {
        return !empty($metadata['resumableIdentifier']) &&
               !empty($metadata['resumableFilename']) &&
               !empty($metadata['resumableChunkNumber']) &&
               !empty($metadata['resumableTotalChunks']);
    }

    /**
     * Save a chunk to storage
     */
    protected function saveChunk(UploadedFile $file, array $metadata): void
    {
        $chunkPath = $this->getChunkPath($metadata);
        
        $this->disk()->put(
            $chunkPath,
            $file->get()
        );
    }

    /**
     * Check if all chunks have been uploaded
     */
    protected function isUploadComplete(array $metadata): bool
    {
        $identifier = $metadata['resumableIdentifier'];
        $filename = $metadata['resumableFilename'];
        $totalChunks = (int) $metadata['resumableTotalChunks'];

        for ($i = 1; $i <= $totalChunks; $i++) {
            if (!$this->chunkExists($identifier, $filename, $i)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if a chunk exists
     */
    protected function chunkExists(string $identifier, string $filename, int $chunkNumber): bool
    {
        $chunkPath = $this->buildChunkPath($identifier, $filename, $chunkNumber);
        return $this->disk()->exists($chunkPath);
    }

    /**
     * Get cached disk instance
     */
    protected function disk()
    {
        if ($this->storageDiskCache === null) {
            $this->storageDiskCache = Storage::disk($this->resumableDisk);
        }
        return $this->storageDiskCache;
    }

    /**
     * Get maximum allowed upload size (override in component to customize)
     */
    protected function maxUploadSize(): ?int
    {
        // Default to PHP's upload_max_filesize
        return min(
            $this->parseSize(ini_get('upload_max_filesize')),
            $this->parseSize(ini_get('post_max_size'))
        );
    }

    /**
     * Parse size string (e.g., "10M", "2G") to bytes
     */
    protected function parseSize(string $size): int
    {
        $unit = strtoupper(substr($size, -1));
        $value = (int) substr($size, 0, -1);
        
        return match($unit) {
            'G' => $value * 1024 * 1024 * 1024,
            'M' => $value * 1024 * 1024,
            'K' => $value * 1024,
            default => (int) $size,
        };
    }

    /**
     * Format bytes to human-readable string
     */
    protected function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $factor = floor((strlen((string) $bytes) - 1) / 3);
        return sprintf("%.2f %s", $bytes / pow(1024, $factor), $units[$factor]);
    }

    /**
     * Assemble all chunks into final file using streaming for memory efficiency
     */
    protected function assembleChunks(array $metadata): ?string
    {
        $identifier = $metadata['resumableIdentifier'];
        $filename = $metadata['resumableFilename'];
        $totalChunks = (int) $metadata['resumableTotalChunks'];

        // Create safe filename
        $safeFilename = $this->sanitizeFilename($filename);
        $finalPath = $this->resumableUploadFolder . '/' . $safeFilename;

        // Check if file already exists
        if ($this->disk()->exists($finalPath)) {
            return null;
        }

        // Use streaming to avoid loading entire file into memory
        $disk = $this->disk();
        $tempPath = $finalPath . '.tmp';
        
        try {
            // Open a write stream for the final file
            $writeStream = $disk->writeStream($tempPath, '');
            
            if (!$writeStream) {
                throw new \RuntimeException("Failed to open write stream for '{$finalPath}'");
            }

            // Stream each chunk directly to the final file
            for ($i = 1; $i <= $totalChunks; $i++) {
                $chunkPath = $this->buildChunkPath($identifier, $filename, $i);
                
                if (!$disk->exists($chunkPath)) {
                    fclose($writeStream);
                    $disk->delete($tempPath);
                    throw new \RuntimeException(
                        "Chunk {$i} missing for file '{$filename}' (identifier: {$identifier})"
                    );
                }
                
                $readStream = $disk->readStream($chunkPath);
                if (!$readStream) {
                    fclose($writeStream);
                    $disk->delete($tempPath);
                    throw new \RuntimeException(
                        "Failed to read chunk {$i} for file '{$filename}' (identifier: {$identifier})"
                    );
                }
                
                stream_copy_to_stream($readStream, $writeStream);
                fclose($readStream);
            }
            
            fclose($writeStream);
            
            // Move temp file to final location
            $disk->move($tempPath, $finalPath);
            
        } catch (\Exception $e) {
            // Clean up temp file if it exists
            if ($disk->exists($tempPath)) {
                $disk->delete($tempPath);
            }
            throw $e;
        }

        // Clean up chunks - delete entire directory at once
        $this->cleanupChunks($identifier);

        return $finalPath;
    }

    /**
     * Clean up chunk files by deleting entire directory (more efficient)
     */
    protected function cleanupChunks(string $identifier): void
    {
        $chunkDir = $this->getChunkDirectory($identifier);
        
        try {
            // Delete entire directory at once - much more efficient
            if ($this->disk()->exists($chunkDir)) {
                $this->disk()->deleteDirectory($chunkDir);
            }
        } catch (\Exception $e) {
            Log::warning('Failed to cleanup chunks', [
                'identifier' => $identifier,
                'directory' => $chunkDir,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Get chunk path from metadata
     */
    protected function getChunkPath(array $metadata): string
    {
        return $this->buildChunkPath(
            $metadata['resumableIdentifier'],
            $metadata['resumableFilename'],
            (int) $metadata['resumableChunkNumber']
        );
    }

    /**
     * Build chunk path
     */
    protected function buildChunkPath(string $identifier, string $filename, int $chunkNumber): string
    {
        $chunkDir = $this->getChunkDirectory($identifier);
        $chunkFilename = $this->sanitizeFilename($filename) . '.' . str_pad((string) $chunkNumber, 4, '0', STR_PAD_LEFT);
        
        return $chunkDir . '/' . $chunkFilename;
    }

    /**
     * Get chunk directory for an upload
     */
    protected function getChunkDirectory(string $identifier): string
    {
        return $this->resumableTempFolder . '/' . $this->sanitizeFilename($identifier);
    }

    /**
     * Sanitize filename
     */
    protected function sanitizeFilename(string $filename): string
    {
        $filename = basename($filename);
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
        $filename = preg_replace('/_+/', '_', $filename);
        return trim($filename, '_');
    }

    /**
     * Handle invalid chunk metadata
     */
    protected function handleInvalidChunk(array $metadata): void
    {
        if (method_exists($this, 'onUploadError')) {
            $this->onUploadError(new \InvalidArgumentException('Invalid chunk metadata'));
        }

        $this->dispatch('upload:error', [
            'message' => 'Invalid chunk metadata',
        ]);
    }

    /**
     * Handle upload errors with better context
     */
    protected function handleUploadError(\Exception $e, array $metadata, int $chunkNumber = null): void
    {
        $identifier = $metadata['resumableIdentifier'] ?? 'unknown';
        $filename = $metadata['resumableFilename'] ?? 'unknown';
        
        $errorContext = [
            'identifier' => $identifier,
            'filename' => $filename,
            'chunk' => $chunkNumber,
            'error' => $e->getMessage(),
        ];

        if (method_exists($this, 'onUploadError')) {
            $this->onUploadError($e);
        }

        $this->dispatch('upload:error', [
            'message' => $e->getMessage(),
            'context' => $errorContext,
        ]);

        Log::error('Resumable upload error', array_merge($errorContext, [
            'metadata' => $metadata,
            'trace' => $e->getTraceAsString(),
        ]));
    }
}
