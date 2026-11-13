export interface SmartCollectionRules {
  search: string;
  minimum_rating: number;
  flag: 'all' | 'flagged' | 'unflagged' | 'rejected';
  source_folder: string | null;
}

export interface Collection {
  id: string;
  name: string;
  parent_id?: string | null;
  collection_type?: 'manual' | 'smart';
  rules?: SmartCollectionRules;
  asset_ids?: string[];
  asset_count?: number;
  created_at?: string;
}
