
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CatDocument = Cat & Document;

@Schema()
export class Cat {
    @Prop()
    name: string;
    
    @Prop()
    gender: Gender;

    @Prop()
    birthdate: Date;

    @Prop()
    breed: string;

    static UPDATE_PROPERTIES = ['name', 'gender', 'birthdate', 'breed'];
}

export enum Gender {
    MALE = 0,
    FEMALE = 1
}

export const CatSchema = SchemaFactory.createForClass(Cat);