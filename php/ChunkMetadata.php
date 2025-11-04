<?php

declare(strict_types=1);

namespace App\Traits;

/**
 * Value Object for chunk metadata
 * Provides type safety and validation for chunk upload data
 */
class ChunkMetadata
{
    public function __construct(
        public readonly string $identifier,
        public readonly string $filename,
        public readonly int $chunkNumber,
        public readonly int $totalChunks,
        public readonly int $chunkSize,
        public readonly int $currentChunkSize,
        public readonly int $totalSize,
        public readonly ?string $type = null,
        public readonly ?string $relativePath = null
    ) {
        $this->validate();
    }

    /**
     * Create from request array (with configurable keys)
     */
    public static function fromRequest(array $data, array $keys = []): self
    {
        // Default keys (can be overridden)
        $defaultKeys = [
            'identifier' => 'resumableIdentifier',
            'filename' => 'resumableFilename',
            'chunkNumber' => 'resumableChunkNumber',
            'totalChunks' => 'resumableTotalChunks',
            'chunkSize' => 'resumableChunkSize',
            'currentChunkSize' => 'resumableCurrentChunkSize',
            'totalSize' => 'resumableTotalSize',
            'type' => 'resumableType',
            'relativePath' => 'resumableRelativePath',
        ];

        $keys = array_merge($defaultKeys, $keys);

        return new self(
            identifier: $data[$keys['identifier']] ?? '',
            filename: $data[$keys['filename']] ?? '',
            chunkNumber: (int) ($data[$keys['chunkNumber']] ?? 0),
            totalChunks: (int) ($data[$keys['totalChunks']] ?? 0),
            chunkSize: (int) ($data[$keys['chunkSize']] ?? 0),
            currentChunkSize: (int) ($data[$keys['currentChunkSize']] ?? 0),
            totalSize: (int) ($data[$keys['totalSize']] ?? 0),
            type: $data[$keys['type']] ?? null,
            relativePath: $data[$keys['relativePath']] ?? null
        );
    }

    /**
     * Validate the metadata
     */
    protected function validate(): void
    {
        if (empty($this->identifier)) {
            throw new \InvalidArgumentException('Chunk identifier is required');
        }

        if (empty($this->filename)) {
            throw new \InvalidArgumentException('Chunk filename is required');
        }

        if ($this->chunkNumber < 1) {
            throw new \InvalidArgumentException('Chunk number must be >= 1');
        }

        if ($this->totalChunks < 1) {
            throw new \InvalidArgumentException('Total chunks must be >= 1');
        }

        if ($this->chunkNumber > $this->totalChunks) {
            throw new \InvalidArgumentException(
                "Chunk number ({$this->chunkNumber}) cannot exceed total chunks ({$this->totalChunks})"
            );
        }

        if ($this->chunkSize <= 0) {
            throw new \InvalidArgumentException('Chunk size must be > 0');
        }

        if ($this->currentChunkSize <= 0) {
            throw new \InvalidArgumentException('Current chunk size must be > 0');
        }

        if ($this->totalSize < 0) {
            throw new \InvalidArgumentException('Total size must be >= 0');
        }
    }

    /**
     * Check if this is the last chunk
     */
    public function isLastChunk(): bool
    {
        return $this->chunkNumber === $this->totalChunks;
    }

    /**
     * Get safe filename
     */
    public function getSafeFilename(): string
    {
        $filename = basename($this->filename);
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
        $filename = preg_replace('/_+/', '_', $filename);
        return trim($filename, '_');
    }

    /**
     * Convert to array
     */
    public function toArray(): array
    {
        return [
            'identifier' => $this->identifier,
            'filename' => $this->filename,
            'chunkNumber' => $this->chunkNumber,
            'totalChunks' => $this->totalChunks,
            'chunkSize' => $this->chunkSize,
            'currentChunkSize' => $this->currentChunkSize,
            'totalSize' => $this->totalSize,
            'type' => $this->type,
            'relativePath' => $this->relativePath,
        ];
    }
}
