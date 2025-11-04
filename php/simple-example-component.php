<?php

namespace App\Http\Livewire;

use Livewire\Component;
use Livewire\WithFileUploads;
use App\Traits\HandlesResumableUploads;

/**
 * Simple Example: Livewire Component with Resumable Uploads using Trait
 * 
 * This example shows the simplest way to add resumable uploads to a Livewire component.
 * The trait handles all the chunk assembly automatically using Livewire's native callbacks.
 */
class SimpleFileUploader extends Component
{
    use WithFileUploads, HandlesResumableUploads;

    /**
     * The upload property - bound to Livewire's upload system
     * The trait automatically handles chunks uploaded to this property
     */
    public $upload;

    /**
     * List of successfully uploaded files
     */
    public $uploadedFiles = [];

    /**
     * Optional: Override storage settings
     */
    protected function mount()
    {
        // Optional: Customize storage location
        // $this->resumableDisk = 'public';
        // $this->resumableUploadFolder = 'user-uploads/' . auth()->id();
    }

    /**
     * Hook: Called when upload is complete
     * 
     * This is automatically called by the trait after all chunks are assembled
     */
    protected function onUploadComplete(string $filepath, string $originalFilename): void
    {
        // Save to database
        $this->uploadedFiles[] = [
            'original' => $originalFilename,
            'path' => $filepath,
            'size' => \Storage::size($filepath),
            'uploaded_at' => now()->toDateTimeString(),
        ];

        // Optional: Additional processing
        // - Generate thumbnails
        // - Send notifications
        // - Process the file
        // etc.

        $this->dispatch('notification', [
            'type' => 'success',
            'message' => "File '{$originalFilename}' uploaded successfully!",
        ]);
    }

    /**
     * Hook: Called on upload error (optional)
     */
    protected function onUploadError(\Exception $e): void
    {
        $this->dispatch('notification', [
            'type' => 'error',
            'message' => 'Upload failed: ' . $e->getMessage(),
        ]);
    }

    /**
     * Remove an uploaded file
     */
    public function removeFile(int $index): void
    {
        if (isset($this->uploadedFiles[$index])) {
            $file = $this->uploadedFiles[$index];
            
            // Delete from storage
            if (\Storage::exists($file['path'])) {
                \Storage::delete($file['path']);
            }
            
            unset($this->uploadedFiles[$index]);
            $this->uploadedFiles = array_values($this->uploadedFiles);
        }
    }

    /**
     * Render the component
     */
    public function render()
    {
        return view('livewire.simple-file-uploader');
    }
}
