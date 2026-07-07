const path = require('path');
const fs = require('fs');

/**
 * Path Service: Unified file resolution across multiple storage roots.
 * Consolidates logic from attachments.js, queue.js, and fileProxy.js.
 */
class PathService {
  constructor() {
    this.roots = {
      watch: process.env.N8N_WATCH_PATH || '',
      whatsapp: process.env.WHATSAPP_WATCH_PATH || '',
      archive: process.env.COMPLETED_JOBS_PATH || '',
      walkin: process.env.WALKIN_UPLOAD_PATH || '',
      upload: process.env.UPLOAD_PATH || ''
    };
  }

  /**
   * Resolves the absolute folder path for a job (QueueJob or Prepress Job)
   */
  resolveJobFolder(job) {
    if (!job) return null;

    // 1. Path Recovery & Remapping (Force local roots over network IPs)
    if (job.folderPath) {
      try {
        const normalized = job.folderPath.replace(/\\/g, '/');
        const rootsToTry = Object.values(this.roots).filter(Boolean);

        for (const root of rootsToTry) {
          const rootBase = path.basename(root).toLowerCase().trim();
          const parts = normalized.toLowerCase().split('/').map(p => p.trim());
          const rootIdx = parts.findIndex(p => p === rootBase || p.includes(rootBase) || rootBase.includes(p));
          
          if (rootIdx !== -1) {
            // Reconstruct path relative to the root we found locally
            const subPath = normalized.split(/[\/\\]/).slice(rootIdx + 1).join(path.sep);
            const resolved = path.join(root, subPath);
            
            // If we found a local version of this path, use it! It's safer than the network IP.
            if (fs.existsSync(resolved)) return resolved;
          }
        }

        // Fallback to direct check only if remapping failed
        if (fs.existsSync(job.folderPath)) return job.folderPath;
      } catch (e) {}
    }

    // 2. Multi-root resolution (Fallback for QueueJobs or ingestion records)
    if (job.relativeFolderPath) {
      const cleanSubPath = job.relativeFolderPath.replace(/^[\\/]+/, '').replace(/\\/g, '/');
      const rootsToTry = [
        job.type === 'WALKIN' ? this.roots.walkin : (job.type === 'WHATSAPP' ? this.roots.whatsapp : this.roots.watch),
        this.roots.watch,
        this.roots.whatsapp,
        this.roots.walkin,
        this.roots.upload
      ].filter(Boolean);

      for (const root of rootsToTry) {
        try {
          if (!fs.existsSync(root)) continue;

          // A. Try direct: root/relativeFolderPath
          const directPath = path.join(root, cleanSubPath);
          if (fs.existsSync(directPath)) return directPath;

          // B. Try one-level deep: root/*/relativeFolderPath
          const subDirs = fs.readdirSync(root, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

          for (const dir of subDirs) {
            const nestedPath = path.join(root, dir, cleanSubPath);
            if (fs.existsSync(nestedPath)) return nestedPath;
          }
        } catch (err) {}
      }
    }

    // 3. Prepress Job Logic (Handled in attachments.js/fileProxy.js)
    if (job.jobId && !job.relativeFolderPath) {
      const uploadBase = this.roots.upload || path.join(__dirname, '..', 'uploads');
      const date = new Date(job.createdAt);
      const dateString = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
      
      const newStyleDir = path.join(uploadBase, 'jobs', dateString, job.jobId);
      const legacyDir = path.join(uploadBase, 'jobs', job.jobId);

      if (fs.existsSync(newStyleDir)) return newStyleDir;
      if (fs.existsSync(legacyDir)) return legacyDir;
    }

    return null;
  }

  /**
   * Safe file path resolution within a job folder (traversal prevention)
   */
  resolveFilePath(job, subPath) {
    const folderPath = this.resolveJobFolder(job);
    if (!folderPath) return null;

    const absolutePath = path.join(folderPath, subPath);
    
    // Traversal check: ensure the resolved path is inside the folderPath
    const rel = path.relative(folderPath, absolutePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      console.warn(`[PathService] Security: Attempted path traversal for job ${job._id} -> ${subPath}`);
      return null;
    }

    return absolutePath;
  }

  /**
   * Permanently deletes a job folder and cleans up empty parent directories.
   */
  deleteJobFolder(job) {
    const folderPath = this.resolveJobFolder(job);
    if (!folderPath) return false;

    try {
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
        
        // Clean up empty parent if it's within our roots
        const parentPath = path.dirname(folderPath);
        for (const rootPath of Object.values(this.roots)) {
          if (rootPath && parentPath !== rootPath && parentPath.startsWith(rootPath)) {
            if (fs.existsSync(parentPath) && fs.readdirSync(parentPath).length === 0) {
              fs.rmdirSync(parentPath);
            }
          }
        }
        return true;
      }
    } catch (err) {
      console.error(`[PathService] Failed to delete folder for job ${job._id}:`, err);
    }
    return false;
  }

  /**
   * Resolves a raw path against all known roots.
   * Useful for legacy proxies where the job object isn't immediately available.
   */
  resolveRawPath(requestedPath) {
    if (!requestedPath) return null;
    const cleanSubPath = requestedPath.replace(/^[\\/]+/, '');
    
    // Attempt to resolve against Watch Path first, then others in priority order
    const rootsToTry = [
      this.roots.watch,
      this.roots.whatsapp,
      this.roots.walkin,
      this.roots.upload,
      this.roots.archive
    ].filter(Boolean);

    for (const root of rootsToTry) {
      const paths = [
        path.join(root, cleanSubPath),
        path.join(root, 'Walkins', cleanSubPath) // Legacy fallback
      ];

      for (const p of paths) {
        if (fs.existsSync(p)) {
          // ðŸ§¹ Traversal check: ensure the resolved path is inside the root
          const normalized = path.resolve(p);
          const absoluteRoot = path.resolve(root);
          if (normalized.toLowerCase().startsWith(absoluteRoot.toLowerCase())) {
            return normalized;
          }
        }
      }
    }
    return null;
  }
}

module.exports = new PathService();

