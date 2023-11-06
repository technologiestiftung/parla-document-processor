export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      processed_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          embedding: string
          id: number
          page: number
          processed_document_id: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          embedding: string
          id?: number
          page: number
          processed_document_id?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          embedding?: string
          id?: number
          page?: number
          processed_document_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_document_chunks_processed_document_id_fkey"
            columns: ["processed_document_id"]
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          }
        ]
      }
      processed_document_summaries: {
        Row: {
          id: number
          processed_document_id: number | null
          summary: string
          summary_embedding: string
          tags: string[]
        }
        Insert: {
          id?: number
          processed_document_id?: number | null
          summary: string
          summary_embedding: string
          tags: string[]
        }
        Update: {
          id?: number
          processed_document_id?: number | null
          summary?: string
          summary_embedding?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "processed_document_summaries_processed_document_id_fkey"
            columns: ["processed_document_id"]
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          }
        ]
      }
      processed_documents: {
        Row: {
          file_checksum: string
          file_size: number
          id: number
          num_pages: number
          processing_error: string | null
          processing_finished_at: string | null
          processing_started_at: string | null
          registered_document_id: number | null
        }
        Insert: {
          file_checksum: string
          file_size: number
          id?: number
          num_pages: number
          processing_error?: string | null
          processing_finished_at?: string | null
          processing_started_at?: string | null
          registered_document_id?: number | null
        }
        Update: {
          file_checksum?: string
          file_size?: number
          id?: number
          num_pages?: number
          processing_error?: string | null
          processing_finished_at?: string | null
          processing_started_at?: string | null
          registered_document_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_documents_registered_document_id_fkey"
            columns: ["registered_document_id"]
            referencedRelation: "registered_documents"
            referencedColumns: ["id"]
          }
        ]
      }
      registered_documents: {
        Row: {
          id: number
          metadata: Json | null
          registered_at: string
          source_type: string
          source_url: string
        }
        Insert: {
          id?: number
          metadata?: Json | null
          registered_at: string
          source_type: string
          source_url: string
        }
        Update: {
          id?: number
          metadata?: Json | null
          registered_at?: string
          source_type?: string
          source_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

