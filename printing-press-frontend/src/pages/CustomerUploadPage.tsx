import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const CustomerUploadPage: React.FC = () => {
  const { staffId } = useParams();
  const [staffName, setStaffName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!staffId || staffId === 'undefined') {
      setError('Invalid QR code. Please ask the staff for a new one.');
      setLoading(false);
      return;
    }

    const uploadUrl = import.meta.env.VITE_UPLOAD_SERVICE_URL || import.meta.env.VITE_BACKEND_URL || window.location.origin;

    // 1. Get staff info & settings
    const fetchData = async () => {
      try {
        const [staffRes, settingsRes] = await Promise.all([
          axios.get(`${uploadUrl}/api/customer-walkin/staff-info/${staffId}`),
          axios.get(`${uploadUrl}/api/customer-walkin/settings`)
        ]);
        
        setStaffName(staffRes.data.staffName);
        const geoRequired = settingsRes.data.walkinGeoRequired;

        if (geoRequired) {
          // Request Geolocation only if required
          if (!window.isSecureContext && window.location.hostname !== 'localhost') {
            setError('Geolocation requires a secure connection (HTTPS). Please ensure the site is served over HTTPS or ask the staff to disable GPS verification.');
            return;
          }

          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setLocation({
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude
                });
              },
              (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                  setError('Location access is required to verify you are at the press. Please enable location services in your browser settings and refresh.');
                } else {
                  setError('Unable to fetch location. Please try again.');
                }
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
          } else {
            setError('Geolocation is not supported by your browser.');
          }
        } else {
          // GPS not required, set a dummy location to satisfy the "waiting" check
          setLocation({ lat: 0, lng: 0 });
        }

      } catch (err: any) {
        setError(err.response?.data?.message || 'Invalid or inactive QR code.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [staffId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      setError('Waiting for location data...');
      return;
    }
    if (files.length === 0) {
      setError('Please select at least one file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('customerName', customerName);
    formData.append('customerPhone', customerPhone);
    formData.append('description', description);
    formData.append('latitude', location.lat.toString());
    formData.append('longitude', location.lng.toString());
    
    files.forEach(file => formData.append('files', file));

    try {
      const uploadUrl = import.meta.env.VITE_UPLOAD_SERVICE_URL || import.meta.env.VITE_BACKEND_URL;
      await axios.post(`${uploadUrl}/api/customer-walkin/upload/${staffId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  if (error && !location && !staffName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-lg max-w-md w-full text-center">
          <div className="text-red-500 mb-4 flex justify-center">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center border-t-4 border-green-500">
          <div className="text-green-500 mb-4 flex justify-center">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Upload Complete!</h2>
          <p className="text-slate-600 font-medium">Your files have been sent directly to <span className="font-bold text-blue-600">{staffName}</span>.</p>
          <p className="text-sm text-slate-400 mt-6">You can close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <div className="bg-blue-600 px-6 py-8 text-center">
          <h1 className="text-2xl font-black text-white tracking-tight">Send Files</h1>
          <p className="text-blue-100 font-medium mt-2 text-sm">Directly to {staffName}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-semibold border border-red-100 flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Your Name</label>
            <input 
              required
              type="text" 
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:ring-0 transition-colors font-medium text-slate-800 outline-none"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
            <input 
              required
              type="tel" 
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:ring-0 transition-colors font-medium text-slate-800 outline-none"
              placeholder="+91 98765 43210"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Files to Print</label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:border-blue-500 transition-colors bg-slate-50">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-slate-600 justify-center">
                  <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-bold text-blue-600 hover:text-blue-500 focus-within:outline-none px-1">
                    <span>Select files</span>
                    <input id="file-upload" name="file-upload" type="file" multiple className="sr-only" onChange={handleFileChange} />
                  </label>
                </div>
                <p className="text-xs font-semibold text-slate-500">PDF, JPG, PNG up to 50MB</p>
              </div>
            </div>
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li key={i} className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-lg flex items-center justify-between">
                    <span className="truncate pr-4">{f.name}</span>
                    <span className="text-slate-400 flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Instructions (Optional)</label>
            <textarea 
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:ring-0 transition-colors font-medium text-slate-800 outline-none resize-none"
              placeholder="E.g. Print 5 copies in color"
            />
          </div>

          <button
            type="submit"
            disabled={uploading || !location}
            className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-sm font-black text-white uppercase tracking-wider ${uploading || !location ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'} transition-all`}
          >
            {uploading ? (
               <span className="flex items-center gap-2">
                 <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 Uploading...
               </span>
            ) : !location ? 'Waiting for Location...' : 'Send to Queue'}
          </button>

          {!location && !error && (
            <p className="text-xs text-center text-slate-500 font-semibold animate-pulse">
              Requesting GPS location to verify your presence...
            </p>
          )}

        </form>
      </div>
    </div>
  );
};

export default CustomerUploadPage;
