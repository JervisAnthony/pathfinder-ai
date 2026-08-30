import { describe, it, expect } from 'vitest';
import { commaSeparatedSkills, newlineResponsibilities } from '../utils';

describe('utils', () => {
  describe('commaSeparatedSkills', () => {
    it('returns empty array for empty string', () => {
      expect(commaSeparatedSkills('')).toEqual([]);
      expect(commaSeparatedSkills('   ')).toEqual([]);
    });

    it('splits and trims skills', () => {
      const result = commaSeparatedSkills('Python, React , TypeScript');
      expect(result).toEqual([
        { name: 'Python' },
        { name: 'React' },
        { name: 'TypeScript' }
      ]);
    });

    it('ignores empty segments', () => {
      const result = commaSeparatedSkills('Python,, ,React');
      expect(result).toEqual([
        { name: 'Python' },
        { name: 'React' }
      ]);
    });
  });

  describe('newlineResponsibilities', () => {
    it('returns empty array for empty string', () => {
      expect(newlineResponsibilities('')).toEqual([]);
      expect(newlineResponsibilities('   ')).toEqual([]);
    });

    it('splits and trims responsibilities', () => {
      const result = newlineResponsibilities('Build features\n Fix bugs \n Write tests');
      expect(result).toEqual([
        { description: 'Build features' },
        { description: 'Fix bugs' },
        { description: 'Write tests' }
      ]);
    });

    it('ignores empty lines', () => {
      const result = newlineResponsibilities('Build features\n\n  \nFix bugs');
      expect(result).toEqual([
        { description: 'Build features' },
        { description: 'Fix bugs' }
      ]);
    });
  });
});
