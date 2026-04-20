import React, { forwardRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';

export interface FormInputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  suffix?: string;
  containerStyle?: object;
  inputContainerStyle?: object;
}

const FormInput = forwardRef<TextInput, FormInputProps>(
  (
    {
      label,
      error,
      hint,
      required,
      leftIcon,
      rightIcon,
      suffix,
      containerStyle,
      inputContainerStyle,
      secureTextEntry,
      editable = true,
      style,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const handleFocus = useCallback(
      (e: any) => {
        setIsFocused(true);
        onFocus?.(e);
      },
      [onFocus]
    );

    const handleBlur = useCallback(
      (e: any) => {
        setIsFocused(false);
        onBlur?.(e);
      },
      [onBlur]
    );

    const togglePasswordVisibility = useCallback(() => {
      setIsPasswordVisible((prev) => !prev);
    }, []);

    const showPassword = secureTextEntry && !isPasswordVisible;

    return (
      <View style={[styles.container, containerStyle]}>
        {label && (
          <View style={styles.labelContainer}>
            <Text style={styles.label}>
              {label}
              {required && <Text style={styles.required}> *</Text>}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.inputContainer,
            isFocused && styles.inputContainerFocused,
            error && styles.inputContainerError,
            !editable && styles.inputContainerDisabled,
            inputContainerStyle,
          ]}
        >
          {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
          <TextInput
            ref={ref}
            style={[
              styles.input,
              leftIcon ? styles.inputWithLeftIcon : null,
              (rightIcon || suffix || secureTextEntry) ? styles.inputWithRightIcon : null,
              !editable ? styles.inputDisabled : null,
              style,
            ]}
            placeholderTextColor={Colors.light.textMuted}
            editable={editable}
            secureTextEntry={showPassword}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...props}
          />
          {suffix && <Text style={styles.suffix}>{suffix}</Text>}
          {secureTextEntry && (
            <TouchableOpacity
              style={styles.rightIcon}
              onPress={togglePasswordVisibility}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isPasswordVisible ? (
                <EyeOff size={18} color={Colors.light.textMuted} />
              ) : (
                <Eye size={18} color={Colors.light.textMuted} />
              )}
            </TouchableOpacity>
          )}
          {rightIcon && !secureTextEntry && (
            <View style={styles.rightIcon}>{rightIcon}</View>
          )}
        </View>
        {(error || hint) && (
          <View style={styles.bottomContainer}>
            {error ? (
              <View style={styles.errorContainer}>
                <AlertCircle size={12} color={Colors.light.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : hint ? (
              <Text style={styles.hintText}>{hint}</Text>
            ) : null}
          </View>
        )}
      </View>
    );
  }
);

FormInput.displayName = 'FormInput';

export default FormInput;

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelContainer: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  required: {
    color: Colors.light.error,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  inputContainerFocused: {
    borderColor: Colors.light.tint,
    borderWidth: 2,
  },
  inputContainerError: {
    borderColor: Colors.light.error,
  },
  inputContainerDisabled: {
    backgroundColor: Colors.light.surfaceSecondary,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
  },
  inputWithLeftIcon: {
    paddingLeft: 8,
  },
  inputWithRightIcon: {
    paddingRight: 8,
  },
  inputDisabled: {
    color: Colors.light.textSecondary,
  },
  leftIcon: {
    paddingLeft: 12,
  },
  rightIcon: {
    paddingRight: 12,
  },
  suffix: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.textSecondary,
    backgroundColor: Colors.light.surfaceSecondary,
    borderLeftWidth: 1,
    borderLeftColor: Colors.light.border,
  },
  bottomContainer: {
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  errorText: {
    fontSize: 12,
    color: Colors.light.error,
  },
  hintText: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
});
