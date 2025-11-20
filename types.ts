export interface Vehicle {
  id: string;
  year: string;
  make: string;
  model: string;
  engine?: string;
  vin?: string;
  contextString?: string; // The generated system instruction for this car
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  repairGuide?: RepairGuide; // Optional structured data for repair guides
}

export interface RepairStep {
  id: string;
  text: string;
  isCompleted: boolean;
}

export interface RepairGuide {
  title: string;
  tools: string[];
  steps: RepairStep[];
  estimatedTime: string;
}

export interface TSB {
  id: string;
  bulletinNumber: string;
  title: string;
  summary: string;
  date: string;
  component: string;
}

export type ChatSessionMap = Record<string, ChatMessage[]>;

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioVolume {
  input: number;
  output: number;
}