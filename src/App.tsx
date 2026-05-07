import { useEffect, useState } from 'react';
import { useMultiSelect } from 'use-multi-select-hook';
import './App.css';

function App() {
  const [historyItems, setHistoryItems] = useState<chrome.history.HistoryItem[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const ids = historyItems.map(item => item.id);
  const { selectedIds, toggleItem, isSelected, clearAll } = useMultiSelect(ids);

  const fetchHistory = () => {
    if (typeof chrome !== 'undefined' && chrome.history) {
      const oneWeekAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
      chrome.history.search({ text: '', maxResults: 1000, startTime: oneWeekAgo }, (results) => {
        setHistoryItems(results);
      });
     
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);
 useEffect(() => {
    const handleGlobalClick = () => setOpenMenuId(null);
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);
  const groupedHistory = historyItems.reduce((acc, item) => {
    if (!item.lastVisitTime) return acc;
    const dateString = new Date(item.lastVisitTime).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    if (!acc[dateString]) acc[dateString] = [];
    acc[dateString].push(item);
    return acc;
  }, {} as Record<string, chrome.history.HistoryItem[]>);

  const handleDeleteSelected = () => {
    selectedIds.forEach(id => {
      const item = historyItems.find(h => h.id === id);
      if (item?.url) chrome.history.deleteUrl({ url: item.url });
    });
    setHistoryItems(prev => prev.filter(item => !selectedIds.includes(item.id)));
    clearAll(); 
  };

  const handleTimeScrub = (minutes: number) => {
    if (!chrome.history) return;
    const startTime = new Date().getTime() - (minutes * 60 * 1000);
    chrome.history.deleteRange({
      startTime: startTime,
      endTime: new Date().getTime()
    }, () => {
      fetchHistory(); 
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

  return (
    <div className="history-container">
      <div className="history-header">
        <h2>History</h2>

        {selectedIds.length === 0 && (
          <div className="quick-actions">
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

      <div className="history-list">
        {Object.entries(groupedHistory).map(([date, items]) => (
          <div key={date}>
            <div className="history-date-group">{date}</div>
            <ul>
              {items.map((entry: chrome.history.HistoryItem) => {
                const timeString = entry.lastVisitTime 
                  ? new Date(entry.lastVisitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                const domainString = entry.url ? new URL(entry.url).hostname : 'unknown';

                return (
                  <li 
                    key={entry.id}
                    className={`history-item ${isSelected(entry.id) ? 'selected' : ''}`}
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
                      <a href={entry.url} target="_blank" rel="noreferrer" className="item-title">
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
                          <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }}></div>
                          <button onClick={() => handleDeleteDomain(domainString)}>
                            Delete ALL from {domainString}
                          </button>
                          </div>
                      )}

                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;