import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown } from 'lucide-react';

interface AutocompleteProps {
  options: Array<{ id: string; nome: string; [key: string]: any }>;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  className?: string;
  multiple?: boolean;
}

export function Autocomplete({
  options,
  value,
  onChange,
  onCreateNew,
  placeholder = 'Selecione uma opção',
  className = '',
  multiple = false
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(option =>
    option.nome.toLowerCase().includes(search.toLowerCase())
  );
  
  const selectedValues = Array.isArray(value) ? value : [value];
  const selectedOptions = options.filter(option => selectedValues.includes(option.id));

  const selectedOption = options.find(option => option.id === value);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 cursor-pointer flex items-center justify-between bg-white"
      >
        <div className="flex flex-wrap gap-1">
          {selectedOptions.length > 0 ? (
            selectedOptions.map(option => (
              <span
                key={option.id}
                className="inline-flex items-center px-2 py-1 rounded-md bg-purple-100 text-purple-800 text-sm"
              >
                {option.nome}
                {multiple && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newValues = selectedValues.filter(v => v !== option.id);
                      onChange(multiple ? newValues : newValues[0]);
                    }}
                    className="ml-1 hover:text-purple-900"
                  >
                    ×
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden"
          >
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Buscar..."
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <div
                    key={option.id}
                    onClick={() => {
                      const newValues = multiple
                        ? selectedValues.includes(option.id)
                          ? selectedValues.filter(v => v !== option.id)
                          : [...selectedValues, option.id]
                        : [option.id];
                      onChange(multiple ? newValues : newValues[0]);
                      if (!multiple) {
                        setIsOpen(false);
                      }
                      setSearch('');
                    }}
                    className={`px-4 py-2 cursor-pointer hover:bg-purple-50 transition-colors ${
                      selectedValues.includes(option.id) ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
                    }`}
                  >
                    {option.nome}
                  </div>
                ))
              ) : (
                <div className="px-4 py-2 text-gray-500 text-center">
                  Nenhum resultado encontrado
                </div>
              )}
            </div>

            {onCreateNew && (
              <div className="p-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateNew();
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors text-center font-medium"
                >
                  + Cadastrar Novo
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}