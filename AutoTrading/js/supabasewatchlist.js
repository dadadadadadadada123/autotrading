import { supabase } from './supabaseClient.js';

/**
 * 수파베이스 관심그룹 DB 연동 클래스
 */
export class SupabaseWatchlist {
    constructor() {
        // HTML의 관심 그룹 관련 DOM 요소들을 매핑
        this.groupNameInput = document.getElementById('watchlistGroupName');
        this.groupTypeSelect = document.getElementById('watchlistGroupType');
        this.groupTopInput = document.getElementById('watchlistGroupTop');
        this.groupAddBtn = document.getElementById('watchlistGroupAddBtn');
        this.groupListDiv = document.getElementById('watchlistGroupList');
        this.watchlistGroupTabs = document.getElementById('watchlistGroupTabs');
        
        this.activeGroupId = null;
        this.init();
    }

    init() {
        // 그룹 추가 버튼 이벤트 연결
        if (this.groupAddBtn) {
            this.groupAddBtn.addEventListener('click', () => this.addGroup());
        }
        // 처음 로드될 때 DB에서 그룹 목록 가져오기
        this.fetchGroups();
    }

    /* ==========================================================================
       1. [CREATE] 수파베이스 DB에 새로운 관심 그룹 저장
       ========================================================================== */
    async addGroup() {
        const groupName = this.groupNameInput.value.trim();
        const groupType = this.groupTypeSelect ? this.groupTypeSelect.value : 'custom';
        const topCount = this.groupTopInput ? parseInt(this.groupTopInput.value) : 20;

        if (!groupName) {
            alert('그룹 이름을 입력해주세요!');
            return;
        }

        // 💡 중요: RLS 보안 정책용 유저 체크 (테스트용으로 끈 상태라면 더미 아이디로 들어갑니다)
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user ? user.id : '00000000-0000-0000-0000-000000000000'; 

        const { error } = await supabase
            .from('watchlist_groups')
            .insert([{
                user_id: userId,
                group_name: groupName,
                group_type: groupType,
                top_count: topCount
            }]);

        if (error) {
            alert('수파베이스 저장 실패: ' + error.message);
        } else {
            alert(`'${groupName}' 그룹이 수파베이스에 저장되었습니다!`);
            this.groupNameInput.value = ''; // 입력창 비우기
            this.fetchGroups(); // 목록 새로고침
        }
    }

    /* ==========================================================================
       2. [READ] 수파베이스 DB에서 관심 그룹 목록 조회 및 렌더링
       ========================================================================== */
    async fetchGroups() {
        if (!this.groupListDiv || !this.watchlistGroupTabs) return;

        const { data: groups, error } = await supabase
            .from('watchlist_groups')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('그룹 로드 실패:', error.message);
            return;
        }

        // 기존 UI 내용 초기화
        this.watchlistGroupTabs.innerHTML = '';
        this.groupListDiv.innerHTML = '';

        if (!groups || groups.length === 0) {
            this.groupListDiv.innerHTML = '<p class="text-xs text-slate-500">생성된 관심 그룹이 없습니다.</p>';
            return;
        }

        groups.forEach(group => {
            // 상단 탭 생성
            const tabBtn = document.createElement('button');
            tabBtn.type = 'button';
            tabBtn.className = `home-ranking-tab ${this.activeGroupId === group.id ? 'is-active' : ''}`;
            tabBtn.textContent = group.group_name;
            tabBtn.dataset.groupId = group.id;
            
            // 탭 클릭 시 활성화 및 종목 로드
            tabBtn.addEventListener('click', () => {
                this.activeGroupId = group.id;
                this.highlightTab(group.id);
                // 💡 여기서 나중에 주식 종목 로드 함수를 호출하면 됩니다.
            });
            this.watchlistGroupTabs.appendChild(tabBtn);

            // 모달 관리창 내부 리스트 생성
            const listItem = document.createElement('div');
            listItem.className = "flex justify-between items-center bg-slate-700/30 p-2 rounded text-sm text-slate-200 mb-2";
            listItem.innerHTML = `
                <span><strong>${group.group_name}</strong> (${group.top_count}개)</span>
                <button class="text-red-400 hover:text-red-500 text-xs" data-id="${group.id}">
                    <i class="fa-solid fa-trash-can"></i> 삭제
                </button>
            `;
            
            // 삭제 버튼 이벤트 연결
            listItem.querySelector('button').addEventListener('click', () => this.deleteGroup(group.id));
            this.groupListDiv.appendChild(listItem);
        });
    }

    /* ==========================================================================
       3. [DELETE] 수파베이스 DB에서 특정 그룹 삭제
       ========================================================================== */
    async deleteGroup(groupId) {
        if (!confirm('이 그룹을 삭제하시겠습니까? 안의 종목도 함께 사라집니다.')) return;

        const { error } = await supabase
            .from('watchlist_groups')
            .delete()
            .eq('id', groupId);

        if (error) {
            alert('삭제 실패: ' + error.message);
        } else {
            if (this.activeGroupId === groupId) this.activeGroupId = null;
            this.fetchGroups(); // 새로고침
        }
    }

    // 탭 스타일 활성화 토글 함수
    highlightTab(groupId) {
        const tabs = this.watchlistGroupTabs.querySelectorAll('.home-ranking-tab');
        tabs.forEach(t => t.classList.toggle('is-active', t.dataset.groupId === groupId));
    }
}