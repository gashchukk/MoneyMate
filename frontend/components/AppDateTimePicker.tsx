import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import RNDateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

type Props = {
  value: Date;
  mode: 'date' | 'time' | 'datetime';
  onChange: (event: DateTimePickerEvent, date?: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
  display?: 'spinner' | 'default' | 'compact' | 'inline' | 'clock' | 'calendar';
};

/** iOS spinner pickers follow system dark mode; force light styling on white app surfaces. */
export default function AppDateTimePicker({ display, ...rest }: Props) {
  const resolvedDisplay = display ?? (Platform.OS === 'ios' ? 'spinner' : 'default');
  const isIosSpinner = Platform.OS === 'ios' && resolvedDisplay === 'spinner';

  const picker = (
    <RNDateTimePicker
      {...rest}
      display={resolvedDisplay as 'spinner' | 'default'}
      style={isIosSpinner ? styles.iosSpinner : undefined}
      {...(Platform.OS === 'ios'
        ? { themeVariant: 'light' as const, textColor: '#1a1a1a' }
        : {})}
    />
  );

  if (isIosSpinner) {
    return <View style={styles.wrap}>{picker}</View>;
  }

  return picker;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#eee',
    marginBottom: 10,
    overflow: 'hidden',
  },
  iosSpinner: {
    height: 132,
  },
});
