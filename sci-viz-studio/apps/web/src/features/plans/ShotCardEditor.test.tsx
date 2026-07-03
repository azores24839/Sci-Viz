import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ShotCardEditor } from './ShotCardEditor';
import type { ShotCard } from '@studio/contracts';

function mockCard(overrides: Partial<ShotCard> = {}): ShotCard {
  const stamp = '2026-07-02T10:00:00.000Z';
  return {
    id: 'card-001', projectId: 'proj-1', title: '实验室全景',
    purpose: '展示整体实验环境', subject: '主实验室', scene: '三楼实验室',
    shotSize: '全景', cameraAngle: '平拍', composition: '设备居中',
    lighting: '冷白光', colorTone: '白/灰', action: '科研人员操作设备',
    scienceInfo: '', priority: 'MUST',
    peopleEquipmentMaterials: ['离心机', '显微镜'],
    risks: [{ id: 'r1', category: 'SAFETY', severity: 'WARNING', description: '注意激光', resolved: false, resolution: '', sourceIds: [] }],
    referenceCaseIds: [], referenceImageUrls: [],
    sortOrder: 0, revision: 1, createdAt: stamp, updatedAt: stamp,
    ...overrides,
  };
}

describe('ShotCardEditor', () => {
  const defaultProps = () => ({
    cards: [] as ShotCard[],
    onCreate: vi.fn().mockResolvedValue(null),
    onUpdate: vi.fn().mockResolvedValue(false) as ReturnType<typeof vi.fn>,
    onRemove: vi.fn(),
    onDuplicate: vi.fn().mockResolvedValue(null),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    error: '',
    onClearError: vi.fn(),
  });

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders empty state when no cards', () => {
    const props = defaultProps();
    render(<ShotCardEditor {...props} />);
    expect(screen.getByText('还没有画面卡。添加你的第一张必拍画面卡。')).toBeTruthy();
  });

  it('shows add form on button click', () => {
    const props = defaultProps();
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);
    fireEvent.click(screen.getByText('+ 添加画面卡'));
    expect(screen.getByText('添加画面卡')).toBeTruthy();
  });

  it('validates required fields', () => {
    const props = defaultProps();
    render(<ShotCardEditor {...props} />);
    fireEvent.click(screen.getByText('+ 添加画面卡'));
    fireEvent.click(screen.getByText('添加画面卡'));

    expect(screen.getByText('请输入标题')).toBeTruthy();
    expect(screen.getByText('请输入目的')).toBeTruthy();
    expect(screen.getByText('请输入拍摄对象')).toBeTruthy();
    expect(screen.getByText('请输入场景')).toBeTruthy();
    expect(screen.getByText('请输入景别')).toBeTruthy();
  });

  it('creates card on valid submit', async () => {
    const props = defaultProps();
    props.onCreate = vi.fn().mockResolvedValue(mockCard({ id: 'new-card' }));
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);

    fireEvent.click(screen.getByText('+ 添加画面卡'));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '新标题' } });
    fireEvent.change(inputs[1]!, { target: { value: '新目的' } });
    fireEvent.change(inputs[2]!, { target: { value: '新对象' } });
    fireEvent.change(inputs[3]!, { target: { value: '新场景' } });
    fireEvent.change(inputs[4]!, { target: { value: '中景' } });

    await act(async () => { fireEvent.click(screen.getByText('添加画面卡')); });
    expect(props.onCreate).toHaveBeenCalled();
  });

  it('keeps form open on create failure', async () => {
    const props = defaultProps();
    props.onCreate = vi.fn().mockResolvedValue(null);
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);

    fireEvent.click(screen.getByText('+ 添加画面卡'));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '失败标题' } });
    fireEvent.change(inputs[1]!, { target: { value: '失败目的' } });
    fireEvent.change(inputs[2]!, { target: { value: '失败对象' } });
    fireEvent.change(inputs[3]!, { target: { value: '失败场景' } });
    fireEvent.change(inputs[4]!, { target: { value: '近景' } });

    await act(async () => { fireEvent.click(screen.getByText('添加画面卡')); });
    expect(screen.getByText('添加画面卡')).toBeTruthy();
    expect(screen.getByDisplayValue('失败标题')).toBeTruthy();
  });

  it('keeps form open on update failure', async () => {
    const props = defaultProps();
    props.onUpdate = vi.fn().mockResolvedValue(false) as ReturnType<typeof vi.fn>;
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);

    fireEvent.click(screen.getByTitle('编辑'));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '修改标题' } });

    await act(async () => { fireEvent.click(screen.getByText('更新画面卡')); });
    expect(screen.getByText('更新画面卡')).toBeTruthy();
  });

  it('shows error banner', () => {
    const props = defaultProps();
    props.error = '网络请求失败';
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);
    expect(screen.getByText('网络请求失败')).toBeTruthy();
  });

  it('cancels edit form', () => {
    const props = defaultProps();
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);
    fireEvent.click(screen.getByTitle('编辑'));
    expect(screen.getByText('更新画面卡')).toBeTruthy();
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText('更新画面卡')).toBeNull();
  });

  it('duplicates card', () => {
    const props = defaultProps();
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);
    fireEvent.click(screen.getByTitle('复制'));
    expect(props.onDuplicate).toHaveBeenCalled();
  });

  it('removes card with confirmation', () => {
    const props = defaultProps();
    props.cards = [mockCard()];
    window.confirm = vi.fn(() => true);
    render(<ShotCardEditor {...props} />);
    fireEvent.click(screen.getByTitle('删除'));
    expect(props.onRemove).toHaveBeenCalled();
  });

  it('move up and down buttons work', () => {
    const props = defaultProps();
    props.cards = [mockCard(), mockCard({ id: 'card-002', title: '第二张' })];
    render(<ShotCardEditor {...props} />);

    const downBtns = screen.getAllByTitle('下移');
    fireEvent.click(downBtns[0]!);
    expect(props.onMoveDown).toHaveBeenCalledWith(0);

    const upBtns = screen.getAllByTitle('上移');
    fireEvent.click(upBtns[1]!);
    expect(props.onMoveUp).toHaveBeenCalledWith(1);
  });

  it('renders priority badges correctly', () => {
    const props = defaultProps();
    props.cards = [
      mockCard({ id: 'c1', priority: 'MUST', title: '必拍卡' }),
      mockCard({ id: 'c2', priority: 'SHOULD', title: '建议卡' }),
      mockCard({ id: 'c3', priority: 'OPTIONAL', title: '可选卡' }),
    ];
    render(<ShotCardEditor {...props} />);
    expect(screen.getByText('必拍')).toBeTruthy();
    expect(screen.getByText('建议')).toBeTruthy();
    expect(screen.getByText('可选')).toBeTruthy();
  });

  it('shows PEM material tags in preview', () => {
    const props = defaultProps();
    props.cards = [mockCard({ peopleEquipmentMaterials: ['离心机', '显微镜', '培养箱'] })];
    render(<ShotCardEditor {...props} />);
    expect(screen.getByText(/离心机/)).toBeTruthy();
  });

  it('shows risk tags in preview', () => {
    const props = defaultProps();
    props.cards = [mockCard()];
    render(<ShotCardEditor {...props} />);
    expect(screen.getByText(/警告/)).toBeTruthy();
  });

  it('has keyboard accessible form fields', () => {
    const props = defaultProps();
    render(<ShotCardEditor {...props} />);
    fireEvent.click(screen.getByText('+ 添加画面卡'));

    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(5);

    const select = screen.getByRole('combobox');
    expect(select).toBeTruthy();
  });
});
