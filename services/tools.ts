import { FunctionDeclaration, Type } from "@google/genai";

export const repairGuideTool: FunctionDeclaration = {
  name: 'create_repair_guide',
  description: 'Generate an interactive repair checklist for a specific automotive procedure.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The name of the repair procedure (e.g., "Alternator Replacement").'
      },
      steps: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Sequential steps to complete the repair.'
      },
      tools: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of tools required for the job.'
      },
      estimatedTime: {
        type: Type.STRING,
        description: 'Estimated time to complete (e.g., "2-3 hours").'
      }
    },
    required: ['title', 'steps', 'tools', 'estimatedTime']
  }
};