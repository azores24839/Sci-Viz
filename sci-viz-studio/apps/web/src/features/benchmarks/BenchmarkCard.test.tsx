import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BenchmarkCard } from './BenchmarkCard';
import type { BenchmarkRecommendation } from '@studio/contracts';

const mockRec: BenchmarkRecommendation = {
  id: 'case-001',
  title: '高校平台实验室',
  thumbnailUrl: '/case-refs/test.jpg',
  sourceUrl: 'https://example.com/case-001',
  sourceDomain: 'Sci-Viz Case Hub',
  discipline: '工程',
  functionalPurpose: '记录',
  distributionMedium: '静图',
  technicalMethod: '拍摄',
  contentType: '设备',
  matchScore: 85,
  matchLevel: 'EXACT',
  recommendationReason: '同为高校工程实验室，设备类型和空间结构高度相似。',
  borrowablePoints: '设备与人物尺度对比、空间秩序表达',
};

describe('BenchmarkCard', () => {
  it('renders title and recommendation reason', () => {
    render(<BenchmarkCard recommendation={mockRec} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.getByText('高校平台实验室')).toBeTruthy();
    expect(screen.getByText(/同为高校工程实验室/)).toBeTruthy();
  });

  it('renders match level badge for EXACT', () => {
    render(<BenchmarkCard recommendation={mockRec} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.getByText('精确匹配')).toBeTruthy();
  });

  it('renders match level badge for RELATED', () => {
    const related = { ...mockRec, matchLevel: 'RELATED' as const };
    render(<BenchmarkCard recommendation={related} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.getByText('相关匹配')).toBeTruthy();
  });

  it('renders match level badge for CROSS_DOMAIN', () => {
    const cross = { ...mockRec, matchLevel: 'CROSS_DOMAIN' as const };
    render(<BenchmarkCard recommendation={cross} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.getByText('跨领域参考')).toBeTruthy();
  });

  it('shows three-axis tags', () => {
    render(<BenchmarkCard recommendation={mockRec} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.getByText('记录')).toBeTruthy();
    expect(screen.getByText('拍摄')).toBeTruthy();
    expect(screen.getByText('静图')).toBeTruthy();
  });

  it('shows borrowable points', () => {
    render(<BenchmarkCard recommendation={mockRec} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.getByText(/设备与人物尺度对比/)).toBeTruthy();
  });

  it('shows source domain and link', () => {
    render(<BenchmarkCard recommendation={mockRec} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.getByText('Sci-Viz Case Hub')).toBeTruthy();
    const link = screen.getByText('查看来源 →') as HTMLAnchorElement;
    expect(link.href).toContain('example.com/case-001');
    expect(link.target).toBe('_blank');
  });

  it('calls onToggle when select button clicked', () => {
    const onToggle = vi.fn();
    render(<BenchmarkCard recommendation={mockRec} selected={false} onToggle={onToggle} saving={false} />);
    fireEvent.click(screen.getByText('选择'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows selected state with checked button', () => {
    render(<BenchmarkCard recommendation={mockRec} selected={true} onToggle={() => {}} saving={false} />);
    expect(screen.getByText('已选')).toBeTruthy();
    expect(screen.queryByText('选择')).toBeNull();
  });

  it('disables select button when saving', () => {
    render(<BenchmarkCard recommendation={mockRec} selected={false} onToggle={() => {}} saving={true} />);
    expect(screen.getByText('选择').closest('button')?.disabled).toBe(true);
  });

  it('renders placeholder for missing thumbnailUrl', () => {
    const noThumb = { ...mockRec, thumbnailUrl: '' };
    render(<BenchmarkCard recommendation={noThumb} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.queryByAltText('高校平台实验室')).toBeNull();
  });

  it('renders without borrowable points', () => {
    const noBorrow = { ...mockRec, borrowablePoints: '' };
    render(<BenchmarkCard recommendation={noBorrow} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.queryByText(/可借鉴/)).toBeNull();
  });

  it('renders without sourceUrl', () => {
    const noSource = { ...mockRec, sourceUrl: '' };
    render(<BenchmarkCard recommendation={noSource} selected={false} onToggle={() => {}} saving={false} />);
    expect(screen.queryByText('查看来源 →')).toBeNull();
  });
});
