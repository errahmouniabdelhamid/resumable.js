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

        try {
            // Save the chunk
            $this->saveChunk($this->upload, $metadata);

            // Check if upload is complete
            if ($this->isUploadComplete($metadata)) {
                $finalPath = $this->assembleChunks($metadata);
                
                if ($finalPath) {
                    $this->completedUploads[] = [
                        'original' => $metadata['filename'],
                        'path' => $finalPath,
                        'uploaded_at' => now(),
                    ];

                    // Call the hook if defined
                    if (method_exists($this, 'onUploadComplete')) {
                        $this->onUploadComplete($finalPath, $metadata['filename']);
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
            $this->handleUploadError($e, $metadata);
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
        
        Storage::disk($this->resumableDisk)->put(
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
        return Storage::disk($this->resumableDisk)->exists($chunkPath);
    }

    /**
     * Assemble all chunks into final file
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
        if (Storage::disk($this->resumableDisk)->exists($finalPath)) {
            return null;
        }

        // Concatenate all chunks
        $finalContent = '';
        for ($i = 1; $i <= $totalChunks; $i++) {
            $chunkPath = $this->buildChunkPath($identifier, $filename, $i);
            $finalContent .= Storage::disk($this->resumableDisk)->get($chunkPath);
        }

        // Save final file
        Storage::disk($this->resumableDisk)->put($finalPath, $finalContent);

        // Clean up chunks
        $this->cleanupChunks($identifier, $filename, $totalChunks);

        return $finalPath;
    }

    /**
     * Clean up chunk files
     */
    protected function cleanupChunks(string $identifier, string $filename, int $totalChunks): void
    {
        for ($i = 1; $i <= $totalChunks; $i++) {
            $chunkPath = $this->buildChunkPath($identifier, $filename, $i);
            
            if (Storage::disk($this->resumableDisk)->exists($chunkPath)) {
                Storage::disk($this->resumableDisk)->delete($chunkPath);
            }
        }

        // Try to delete chunk directory
        $chunkDir = $this->getChunkDirectory($identifier);
        try {
            Storage::disk($this->resumableDisk)->deleteDirectory($chunkDir);
        } catch (\Exception $e) {
            // Ignore if directory is not empty or can't be deleted
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
     * Handle upload errors
     */
    protected function handleUploadError(\Exception $e, array $metadata): void
    {
        if (method_exists($this, 'onUploadError')) {
            $this->onUploadError($e);
        }

        $this->dispatch('upload:error', [
            'message' => $e->getMessage(),
        ]);

        Log::error('Resumable upload error', [
            'error' => $e->getMessage(),
            'metadata' => $metadata,
        ]);
    }
}
