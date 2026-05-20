import { toast as hotToast } from 'react-hot-toast';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

type ToastId = string;

interface ToastOptions {
  duration?: number;
  position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
}

const defaultOptions: ToastOptions = {
  duration: 4000,
  position: 'top-right'
};

const toastIds = new Map<ToastId, boolean>();

// Função para verificar se está em dark mode
const isDarkMode = () => document.documentElement.classList.contains('dark');

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    const dark = isDarkMode();
    return hotToast.custom(
      (t) => (
        <div
          className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-md w-full ${
            dark 
              ? 'bg-gradient-to-r from-green-900/95 to-emerald-900/95 border border-green-700/50' 
              : 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200'
          } backdrop-blur-xl shadow-2xl rounded-xl pointer-events-auto flex ring-1 ${
            dark ? 'ring-green-700/30' : 'ring-green-200/50'
          }`}
        >
          <div className="flex-1 w-0 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <CheckCircle className={`h-5 w-5 ${dark ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <div className="ml-3 flex-1">
                <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className={`flex border-l ${dark ? 'border-green-700/50' : 'border-green-200'}`}>
            <button
              onClick={() => hotToast.dismiss(t.id)}
              className={`w-full border border-transparent rounded-none rounded-r-xl p-4 flex items-center justify-center text-sm font-medium ${
                dark 
                  ? 'text-green-300 hover:text-white hover:bg-green-800/50' 
                  : 'text-green-700 hover:text-green-800 hover:bg-green-100'
              } focus:outline-none transition-all duration-200`}
            >
              ✕
            </button>
          </div>
        </div>
      ),
      { ...defaultOptions, ...options }
    );
  },

  error: (message: string, options?: ToastOptions) => {
    const dark = isDarkMode();
    return hotToast.custom(
      (t) => (
        <div
          className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-md w-full ${
            dark 
              ? 'bg-gradient-to-r from-red-900/95 to-rose-900/95 border border-red-700/50' 
              : 'bg-gradient-to-r from-red-50 to-rose-50 border border-red-200'
          } backdrop-blur-xl shadow-2xl rounded-xl pointer-events-auto flex ring-1 ${
            dark ? 'ring-red-700/30' : 'ring-red-200/50'
          }`}
        >
          <div className="flex-1 w-0 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <XCircle className={`h-5 w-5 ${dark ? 'text-red-400' : 'text-red-600'}`} />
              </div>
              <div className="ml-3 flex-1">
                <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className={`flex border-l ${dark ? 'border-red-700/50' : 'border-red-200'}`}>
            <button
              onClick={() => hotToast.dismiss(t.id)}
              className={`w-full border border-transparent rounded-none rounded-r-xl p-4 flex items-center justify-center text-sm font-medium ${
                dark 
                  ? 'text-red-300 hover:text-white hover:bg-red-800/50' 
                  : 'text-red-700 hover:text-red-800 hover:bg-red-100'
              } focus:outline-none transition-all duration-200`}
            >
              ✕
            </button>
          </div>
        </div>
      ),
      { ...defaultOptions, ...options }
    );
  },

  info: (message: string, options?: ToastOptions) => {
    const dark = isDarkMode();
    const id = hotToast.custom(
      (t) => (
        <div
          className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-md w-full ${
            dark 
              ? 'bg-gradient-to-r from-blue-900/95 to-indigo-900/95 border border-blue-700/50' 
              : 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200'
          } backdrop-blur-xl shadow-2xl rounded-xl pointer-events-auto flex ring-1 ${
            dark ? 'ring-blue-700/30' : 'ring-blue-200/50'
          }`}
        >
          <div className="flex-1 w-0 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <AlertCircle className={`h-5 w-5 ${dark ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div className="ml-3 flex-1">
                <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className={`flex border-l ${dark ? 'border-blue-700/50' : 'border-blue-200'}`}>
            <button
              onClick={() => hotToast.dismiss(t.id)}
              className={`w-full border border-transparent rounded-none rounded-r-xl p-4 flex items-center justify-center text-sm font-medium ${
                dark 
                  ? 'text-blue-300 hover:text-white hover:bg-blue-800/50' 
                  : 'text-blue-700 hover:text-blue-800 hover:bg-blue-100'
              } focus:outline-none transition-all duration-200`}
            >
              ✕
            </button>
          </div>
        </div>
      ),
      { ...defaultOptions, ...options }
    );
    toastIds.set(id, true);
    return id;
  },

  dismiss: (id?: ToastId) => {
    if (id && toastIds.has(id)) {
      hotToast.dismiss(id);
      toastIds.delete(id);
    }
  }
};