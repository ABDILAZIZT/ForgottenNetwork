import {
  deleteRemoteMutation,
  loadRemoteMutations,
  putRemoteMutation,
  putRemoteMutations,
} from '../engine/db';
import type { StoredRemoteMutation } from '../engine/db';

export interface RemoteMutationQueue {
  putMany(mutations: StoredRemoteMutation[]): Promise<void>;
  put(mutation: StoredRemoteMutation): Promise<void>;
  list(): Promise<StoredRemoteMutation[]>;
  delete(id: string): Promise<void>;
}

export class IndexedDbRemoteMutationQueue implements RemoteMutationQueue {
  putMany(mutations: StoredRemoteMutation[]) {
    return putRemoteMutations(mutations);
  }
  put(mutation: StoredRemoteMutation) {
    return putRemoteMutation(mutation);
  }

  list() {
    return loadRemoteMutations();
  }

  delete(id: string) {
    return deleteRemoteMutation(id);
  }
}

export class MemoryRemoteMutationQueue implements RemoteMutationQueue {
  private records = new Map<string, StoredRemoteMutation>();

  async putMany(mutations: StoredRemoteMutation[]) {
    for (const mutation of mutations) this.records.set(mutation.id, structuredClone(mutation));
  }

  async put(mutation: StoredRemoteMutation) {
    this.records.set(mutation.id, mutation);
  }

  async list() {
    return Array.from(this.records.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  async delete(id: string) {
    this.records.delete(id);
  }
}
