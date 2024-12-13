let selectedImages = new Set();
let imageData = [];

function updateLoadingUI(processedPosts, foundImages, currentStatus) {
  const loading = document.getElementById('loading');
  loading.style.display = 'block';
  
  document.getElementById('processedPosts').textContent = processedPosts;
  document.getElementById('foundImages').textContent = foundImages;
  document.getElementById('currentPost').textContent = currentStatus;
}

function createArticleUrl(articleId) {
  return `https://cafe.naver.com/ArticleRead.nhn?clubid=29844827&menuid=46&boardtype=L&articleid=${articleId}`;
}

function createBoardListUrl(page) {
  return `https://cafe.naver.com/ArticleList.nhn?search.clubid=29844827&search.menuid=46&search.boardtype=L&search.page=${page}`;
}

document.getElementById('fetchButton').addEventListener('click', async () => {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  
  if (!startDate || !endDate) {
    alert('날짜를 선택해주세요.');
    return;
  }
  
  imageData = [];
  selectedImages.clear();
  showSkeletonLoader();
  document.getElementById('startSlideshow').disabled = true;
  
  try {
    const fanMadeTab = await chrome.tabs.create({ 
      url: 'https://cafe.naver.com/ingsfriends/menu/46', 
      active: false 
    });

    const targetTabId = await new Promise(resolve => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === fanMadeTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(tabId);
        }
      });
    });

    imageData = await fetchImages(startDate, endDate, targetTabId);
    
    await chrome.tabs.remove(targetTabId);
    
    if (imageData.length > 0) {
      displayImages(imageData);
      alert(`총 ${imageData.length}개의 이미지를 찾았습니다.`);
    } else {
      alert('선택한 기간에 이미지가 없습니다.');
    }
  } catch (error) {
    alert('이미지를 불러오는 중 오류가 발생했습니다.');
    console.error(error);
  }
});

async function fetchImages(startDate, endDate, specificTabId) {
  const images = [];
  let processedPosts = 0;

  const loadingDiv = document.getElementById('loading');
  const resultsDiv = document.getElementById('results');
  
  loadingDiv.style.display = 'block';
  resultsDiv.style.display = 'none';
  

  try {
    const moveResult = await chrome.scripting.executeScript({
      target: { tabId: specificTabId },
      func: () => {
        if (!window.location.href.includes('https://cafe.naver.com/ingsfriends/menu/46')) {
          console.log('잘못된 페이지입니다.');
          return null;
        }

        const iframe = document.getElementById('cafe_main');
        if (!iframe || !iframe.contentDocument) {
          console.log('iframe을 찾을 수 없습니다.');
          return null;
        }

        const generalBoardList = iframe.contentDocument.querySelector('.article-board.m-tcol-c:not(#upperArticleList)');
        if (generalBoardList) {
          const firstPost = generalBoardList.querySelector('.article');
          if (firstPost) {
            console.log('첫 번째 게시글 클릭');
            firstPost.click();
            return true;
          } else {
            console.log('첫 번째 게시글을 찾을 수 없습니다.');
            return null;
          }
        } else {
          console.log('일반 게시글 목록을 찾을 수 없습니다.');
          return null;
        }
      }
    });

    if (moveResult[0].result !== true) {
      throw new Error('게시글 이동 실패');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    while (true) {
      const dateResult = await chrome.scripting.executeScript({
        target: { tabId: specificTabId },
        func: () => {
          const iframe = document.getElementById('cafe_main');
          if (!iframe || !iframe.contentDocument) {
            console.log('iframe을 찾을 수 없습니다.');
            return null;
          }

          const dateEl = iframe.contentDocument.querySelector('.date');
          const dateText = dateEl ? dateEl.textContent.trim() : null;
          console.log('현재 게시글 날짜:', dateText);
          return dateText;
        }
      });

      const currentDateText = dateResult[0].result;
      if (!currentDateText) {
        console.log('날짜를 찾을 수 없습니다.');
        break;
      }

      const [datePart] = currentDateText.split(' ');
      const [year, month, day] = datePart.replace(/\./g, '-').split('-');
      const currentDate = new Date(year, month - 1, day);
      currentDate.setHours(0, 0, 0, 0);

      const startDateObj = new Date(startDate);
      startDateObj.setHours(0, 0, 0, 0);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      if (currentDate < startDateObj) {
        console.log('시작 날짜 이전입니다. 수집 종료');
        break;
      }

      if (currentDate >= startDateObj && currentDate <= endDateObj) {
        const imagesResult = await chrome.scripting.executeScript({
          target: { tabId: specificTabId },
          func: () => {
            const iframe = document.getElementById('cafe_main');
            if (!iframe || !iframe.contentDocument) {
              console.log('iframe 없음');
              return [];
            }
        
            const authorEl = iframe.contentDocument.querySelector('.nickname');
            const author = authorEl ? authorEl.textContent.trim() : '익명';
            const dateEl = iframe.contentDocument.querySelector('.date');
            const dateText = dateEl ? dateEl.textContent.trim() : '';
        
            const imageEls = iframe.contentDocument.querySelectorAll([
              '.se-image-resource',
              '.post_content img',
              'img.se-image-resource'
            ].join(','));
        
            return Array.from(imageEls)
              .map(img => ({
                url: img.src || img.getAttribute('src'),
                author: author,
                date: dateText
              }))
              .filter(img => img.url && img.url.startsWith('http'));
          }
        });
        
        if (Array.isArray(imagesResult[0].result)) {
          images.push(...imagesResult[0].result);
          processedPosts++;

          updateLoadingUI(processedPosts, images.length, `현재 게시글: ${currentDateText}`);
        }
      }

      const hasNextPost = await chrome.scripting.executeScript({
        target: { tabId: specificTabId },
        func: () => {
          const iframe = document.getElementById('cafe_main');
          if (!iframe || !iframe.contentDocument) {
            console.log('iframe을 찾을 수 없습니다.');
            return false;
          }

          const nextButton = iframe.contentDocument.querySelector('.BaseButton.btn_next');

          if (nextButton) {
            console.log('다음 글 버튼 찾음');
            nextButton.click();
            return true;
          } else {
            console.log('다음 글 버튼을 찾을 수 없습니다.');
            return false;
          }
        }
      });

      if (!hasNextPost[0].result) {
        console.log('더 이상 다음 글이 없습니다. 수집 종료');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

  } catch (error) {
    console.error('이미지 수집 중 오류:', error);
    throw error;
  } finally {
    loadingDiv.style.display = 'none';

    if (images.length > 0) {
        resultsDiv.style.display = 'block';
        document.getElementById('totalProcessedPosts').textContent = processedPosts;
        document.getElementById('totalFoundImages').textContent = images.length;
    }
}

  console.log('최종 수집된 이미지 수:', images.length);
  return images;
}

function displayImages(images) {
  const grid = document.getElementById('imagesGrid');
  grid.innerHTML = '';

  const resultsDiv = document.getElementById('results');
  resultsDiv.style.display = 'block';
  
  images.forEach((image, index) => {
    const container = document.createElement('div');
    container.className = 'image-container';
    container.innerHTML = `
      <img src="${image.url}" alt="Fan content ${index + 1}">
      <div class="image-info">
        <div>made by ${image.author}</div>
        <div>${image.date || ''}</div>
      </div>
    `;
    
    container.addEventListener('click', () => {
      container.classList.toggle('selected');
      if (container.classList.contains('selected')) {
        selectedImages.add(index);
      } else {
        selectedImages.delete(index);
      }
      document.getElementById('startSlideshow').disabled = selectedImages.size === 0;
    });
    
    grid.appendChild(container);
  });
}

document.getElementById('startSlideshow').addEventListener('click', () => {
  const selectedImageData = Array.from(selectedImages).map(index => {
    if (index !== undefined && imageData[index]) {
      return imageData[index];
    }
  }).filter(Boolean);

  chrome.storage.local.set({ 
    'slideshowImages': selectedImageData 
  }, () => {
    window.location.href = 'slideshow.html';
  });
});

function showSkeletonLoader() {
  const grid = document.getElementById('imagesGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const skeletonItem = document.createElement('div');
    skeletonItem.className = 'skeleton-item';
    grid.appendChild(skeletonItem);
  }
}

document.getElementById('lastWeekBtn').addEventListener('click', () => {
  const today = new Date();
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(today.getDate() - 7);
  
  document.getElementById('startDate').value = oneWeekAgo.toISOString().split('T')[0];
  document.getElementById('endDate').value = today.toISOString().split('T')[0];
});

document.getElementById('lastMonthBtn').addEventListener('click', () => {
  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(today.getMonth() - 1);
  
  document.getElementById('startDate').value = oneMonthAgo.toISOString().split('T')[0];
  document.getElementById('endDate').value = today.toISOString().split('T')[0];
});

document.getElementById('selectAllBtn').addEventListener('click', () => {
  const imageContainers = document.querySelectorAll('.image-container');
  
  imageContainers.forEach((container, index) => {
    container.classList.add('selected');
    selectedImages.add(index);
  });

  document.getElementById('startSlideshow').disabled = false;
});

document.getElementById('deselectAllBtn').addEventListener('click', () => {
  const imageContainers = document.querySelectorAll('.image-container');
  
  imageContainers.forEach(container => {
    container.classList.remove('selected');
  });

  selectedImages.clear();
  document.getElementById('startSlideshow').disabled = true;
});