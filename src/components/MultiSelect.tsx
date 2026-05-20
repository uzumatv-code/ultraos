import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, X } from 'lucide-react';

interface Option {
  id: string;
  nome: string;
  valor?: number;
}

interface MultiSelectProps {
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onDescriptionChange?: (id: string, description: string) => void;
  getInitialDescription?: (id: string) => string;
  onCreateNew?: () => void;
  placeholder?: string;
  className?: string;
  label: string;
  descriptions?: Record<string, string>;
}

export function MultiSelect({
  options,
  selectedIds,
  onChange,
  onDescriptionChange,
  getInitialDescription,
  onCreateNew,
  placeholder = 'Selecione opções',
  className = '',
  label,
  descriptions = {}
}: MultiSelectProps) {
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

  const selectedOptions = options.filter(option => selectedIds.includes(option.id));

  function handleSelect(option: Option) {
    const newSelectedIds = selectedIds.includes(option.id)
      ? selectedIds.filter(id => id !== option.id)
      : [...selectedIds, option.id];
    
    // If adding a new option and we have a getInitialDescription function
    if (!selectedIds.includes(option.id) && getInitialDescription) {
      const initialDescription = getInitialDescription(option.id);
      if (initialDescription && onDescriptionChange) {
        onDescriptionChange(option.id, initialDescription);
      }
    }
    
    onChange(newSelectedIds);
  }

  function handleRemove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(selectedIds.filter(selectedId => selectedId !== id));
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 cursor-pointer bg-white min-h-[42px]"
      >
        <div className="flex flex-wrap gap-2">
          {selectedOptions.length > 0 ? (
            selectedOptions.map(option => (
              <div
                key={option.id}
                className="inline-flex items-center px-2 py-1 rounded-md bg-purple-100 text-purple-800 text-sm"
              >
                <span>{option.nome}</span>
                <button
                  type="button"
                  onClick={(e) => handleRemove(option.id, e)}
                  className="ml-1 hover:text-purple-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>

      {selectedOptions.length > 0 && (
        <div className="mt-2">
          {selectedOptions.map(option => (
            <div key={option.id} className="mb-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Descrição para {option.nome}
              </label>
              <textarea
                value={descriptions[option.id] || ''}
                onChange={(e) => onDescriptionChange?.(option.id, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder={`Descreva os detalhes para ${option.nome}`}
                rows={2}
              />
            </div>
          ))}
        </div>
      )}

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
                    onClick={() => handleSelect(option)}
                    className={`px-4 py-2 cursor-pointer hover:bg-purple-50 transition-colors ${
                      selectedIds.includes(option.id) ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{option.nome}</span>
                      {option.valor && (
                        <span className="text-sm text-gray-500">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          }).format(option.valor)}
                        </span>
                      )}
                    </div>
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