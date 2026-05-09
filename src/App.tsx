import { useEffect, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMultiSelect } from 'use-multi-select-hook';
import './App.css';

function App() {
  const [historyItems, setHistoryItems] = useState<chrome.history.HistoryItem[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [emptySearchDate, setEmptySearchDate] = useState<string | null>(null);

  const [daysLoaded, setDaysLoaded] = useState(7);

  const ids = historyItems.map(item => item.id);
  const { selectedIds, toggleItem, isSelected, clearAll } = useMultiSelect(ids);
  const groupedHistory = historyItems.reduce((acc, item) => {
    if (!item.lastVisitTime) return acc;
    const dateString = new Date(item.lastVisitTime).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    if (!acc[dateString]) acc[dateString] = [];
    acc[dateString].push(item);
    return acc;
  }, {} as Record<string, chrome.history.HistoryItem[]>);
  type FlatItem = 
    | { type: 'header'; date: string }
    | { type: 'item'; data: chrome.history.HistoryItem; date: string };

  const flatItems: FlatItem[] = [];
  Object.entries(groupedHistory).forEach(([date, items]) => {
    flatItems.push({ type: 'header', date });
    items.forEach(item => {
      flatItems.push({ type: 'item', data: item, date });
    });
  });
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      return flatItems[index].type === 'header' ? 40 : 60; 
    },
  });
  const handleDeleteSelected = () => {
    selectedIds.forEach(id => {
      const item = historyItems.find(h => h.id === id);
      if (item?.url) chrome.history.deleteUrl({ url: item.url });
    });
    setHistoryItems(prev => prev.filter(item => !selectedIds.includes(item.id)));
    clearAll(); 
  };
const fetchHistory = (daysToFetch: number) => {
    if (typeof chrome !== 'undefined' && chrome.history) {
      const startTime = new Date().getTime() - (daysToFetch * 24 * 60 * 60 * 1000);
      chrome.history.search({ text: '', maxResults: 10000, startTime }, (results) => {
        setHistoryItems(results);
      });
    }
  };
  useEffect(() => {
    fetchHistory(daysLoaded);
  }, [daysLoaded]);
  useEffect(() => {
    const handleGlobalClick = () => setOpenMenuId(null);
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);
  const handleTimeScrub = (minutes: number) => {
    if (!chrome.history) return;
    const startTime = new Date().getTime() - (minutes * 60 * 1000);
    chrome.history.deleteRange({
      startTime: startTime,
      endTime: new Date().getTime()
    }, () => {
      fetchHistory(daysLoaded); 
    });
  };

  const handleDeleteDomain = (domain: string) => {
    const itemsToDelete = historyItems.filter(item => item.url && new URL(item.url).hostname === domain);
    itemsToDelete.forEach(item => {
      if (item.url) chrome.history.deleteUrl({ url: item.url });
    });
    setHistoryItems(prev => prev.filter(item => !(item.url && new URL(item.url).hostname === domain)));
    setOpenMenuId(null);
  };
  const handleOpenSelected = () => {
  selectedIds.forEach(id => {
    const item = historyItems.find(h => h.id === id);
    if (item?.url) {
      chrome.tabs.create({ url: item.url, active: false }); 
    }
  });
  clearAll(); 
};
const handleDeleteDomainForDate = (domain: string, targetDate: string) => {
    const itemsToDelete = historyItems.filter(item => {
      if (!item.url || !item.lastVisitTime) return false;
      const itemDomain = new URL(item.url).hostname;
      const itemDate = new Date(item.lastVisitTime).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      return itemDomain === domain && itemDate === targetDate;
    });

    itemsToDelete.forEach(item => {
      if (item.url) chrome.history.deleteUrl({ url: item.url });
    });
    setHistoryItems(prev => prev.filter(item => {
      if (!item.url || !item.lastVisitTime) return true;
      const itemDomain = new URL(item.url).hostname;
      const itemDate = new Date(item.lastVisitTime).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      return !(itemDomain === domain && itemDate === targetDate);
    }));
    
    setOpenMenuId(null);
  };
  const handleJumpToDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = e.target.value;
    if (!selectedDate) return;

    const [year, month, day] = selectedDate.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    const diffTime = new Date().getTime() - dateObj.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > daysLoaded) {
      setDaysLoaded(diffDays + 2);
    }

    const targetDateString = dateObj.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    const scrollToDate = (targetDate: string) => {
      const headerIndex = flatItems.findIndex(
        item => item.type === 'header' && item.date === targetDate
      );
      if (headerIndex !== -1) {
        rowVirtualizer.scrollToIndex(headerIndex, { align: 'start' });
      }
    };

    if (groupedHistory[targetDateString]) {
      setEmptySearchDate(null);
      scrollToDate(targetDateString);
    } else {
      setEmptySearchDate(targetDateString);
      setTimeout(() => scrollToDate(targetDateString), 50);
    }
  };
  
  return (
    <div className="history-container">
      <div className="history-header">
        <h2>History</h2>

        {selectedIds.length === 0 && (
          <div className="quick-actions">
            <input 
              type="date" 
              className="btn-scrub date-picker" 
              onChange={handleJumpToDate} 
              title="Jump to date"
            />
            <button className="btn-scrub" onClick={() => handleTimeScrub(15)}>Clear last 15m</button>
            <button className="btn-scrub" onClick={() => handleTimeScrub(60)}>Clear 1h</button>
          </div>
        )}
        {selectedIds.length > 0 && (
          <div className="bulk-actions">
            <span>{selectedIds.length} selected</span>
            <button className="btn-delete" onClick={handleDeleteSelected}>Delete</button>
            <button className="btn-cancel" onClick={clearAll}>Cancel</button>
          </div>
        )}
      </div>

      <div 
        ref={parentRef} 
        className="history-list" 
        style={{ height: 'calc(100vh - 120px)', overflowY: 'auto', overflowX: 'hidden' }}
      >
        
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {emptySearchDate && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'gray' }}>
              No history found for {emptySearchDate}.
            </div>
          )}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const flatItem = flatItems[virtualRow.index];

            if (flatItem.type === 'header') {
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="history-date-group">{flatItem.date}</div>
                </div>
              );
            }

            const entry = flatItem.data;
            const date = flatItem.date;
            const timeString = entry.lastVisitTime 
              ? new Date(entry.lastVisitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const domainString = entry.url ? new URL(entry.url).hostname : 'unknown';

            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0, left: 0, width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <li 
                  className={`history-item ${isSelected(entry.id) ? 'selected' : ''}`}
                  style={{ listStyle: 'none' }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName !== 'A' && !(e.target as HTMLElement).closest('.action-menu-container')) {
                      toggleItem(entry.id, e.shiftKey);
                    }
                  }}
                >
                  <div className="item-checkbox">
                    <input type="checkbox" checked={isSelected(entry.id)} readOnly />
                  </div>
                  <div className="item-time">{timeString}</div>
                  
                  {chrome.runtime?.id && (
                    <div className="item-favicon">
                      <img 
                        src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(entry.url || '')}&size=32`} 
                        alt="" 
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    </div>
                  )}
                  
                  <div className="item-details">
                    <a href={entry.url} target="_blank" rel="noreferrer noopener" className="item-title">
                      {entry.title || entry.url}
                    </a>
                    <span className="item-domain">{domainString}</span>
                  </div>

                  <div className="action-menu-container">
                    <button 
                      className="item-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === entry.id ? null : entry.id);
                      }}
                    >⋮</button>
                    {openMenuId === entry.id && (
                      <div className="dropdown-menu">
                        <button onClick={() => handleDeleteDomainForDate(domainString, date)}>
                          Delete from {domainString} for {date}
                        </button>
                        <button onClick={() => handleDeleteDomain(domainString)}>
                          Delete ALL from {domainString}
                        </button>
                        <button onClick={handleOpenSelected}>
                          Open {selectedIds.length} Tabs
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', padding: '30px 15px' }}>
          <button 
            className="btn-scrub" 
            onClick={() => setDaysLoaded(prev => prev + 7)}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            Load Older History
          </button>
        </div>
      </div>

      </div> 
  );
}

export default App;