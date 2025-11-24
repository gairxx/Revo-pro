import React, { useState } from 'react';
import { Vehicle } from '../types';
import { generateVehicleContext } from '../services/geminiContext';

interface VehicleSelectorProps {
  onVehicleCreated: (vehicle: Vehicle) => void;
}

const VehicleSelector: React.FC<VehicleSelectorProps> = ({ onVehicleCreated }) => {
  const [formData, setFormData] = useState({
    year: '',
    make: '',
    model: '',
    engine: '',
    vin: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null); // Clear error on user input
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Generate the specialist context
      const contextString = await generateVehicleContext(formData);

      // 2. Create vehicle object
      const newVehicle: Vehicle = {
        id: crypto.randomUUID(),
        ...formData,
        contextString,
        createdAt: Date.now()
      };

      onVehicleCreated(newVehicle);
    } catch (err: any) {
      console.error("Initialization error:", err);
      // Display a professional user-facing error message
      setError("Diagnostic Server Connection Failed. The Revo database is currently unreachable. Please check your internet connection or try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="max-w-md w-full bg-gray-900/50 p-8 rounded-2xl border border-gray-700 shadow-2xl backdrop-blur-xl">
        <h2 className="text-3xl font-bold mb-2 text-blue-400">New Diagnostic Session</h2>
        <p className="text-gray-400 mb-8">Enter vehicle details to initialize Revo's technical database.</p>
        
        {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-left">
                <div className="flex items-center gap-2 mb-1">
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <h3 className="font-bold text-red-400 text-sm">System Unavailable</h3>
                </div>
                <p className="text-xs text-red-300/80 leading-relaxed">
                    {error}
                </p>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              required
              type="text"
              name="year"
              placeholder="Year (e.g. 2018)"
              value={formData.year}
              onChange={handleChange}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
            <input
              required
              type="text"
              name="make"
              placeholder="Make (e.g. Ford)"
              value={formData.make}
              onChange={handleChange}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
          </div>
          <input
            required
            type="text"
            name="model"
            placeholder="Model (e.g. F-150 Lariat)"
            value={formData.model}
            onChange={handleChange}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
          <input
            type="text"
            name="engine"
            placeholder="Engine (e.g. 5.0L Coyote V8)"
            value={formData.engine}
            onChange={handleChange}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
           <input
            type="text"
            name="vin"
            placeholder="VIN (Optional)"
            value={formData.vin}
            onChange={handleChange}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
              loading 
                ? 'bg-blue-900 text-blue-300 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading Database...
              </span>
            ) : (
              "Initialize Revo"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default VehicleSelector;